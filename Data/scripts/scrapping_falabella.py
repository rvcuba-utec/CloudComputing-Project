from playwright.sync_api import sync_playwright
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape

import pandas as pd
import requests
import random
import os
import re
import json

LIMIT_PER_CATEGORY = 1000
MAX_WORKERS = 6

IMAGES_FOLDER = "imagenes"
OUTPUT_CSV_FILE = "falabella_completo.csv"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    )
}

categories = {
    "tecnologia": "https://www.falabella.com.pe/falabella-pe/category/cat40793/Tecnologia",
    "electrohogar": "https://www.falabella.com.pe/falabella-pe/category/cat40584/Electrohogar",
    "muebles": "https://www.falabella.com.pe/falabella-pe/category/cat50684/Dormitorio",
    "belleza-higiene-salud": "https://www.falabella.com.pe/falabella-pe/category/cat40498/Belleza--higiene-y-salud",
    "deportes": "https://www.falabella.com.pe/falabella-pe/category/cat40571/Deportes-y-aire-libre",
    "automotriz": "https://www.falabella.com.pe/falabella-pe/category/CATG11944/Automotriz",
    "hombre": "https://www.falabella.com.pe/falabella-pe/category/CATG12022/Hombre",
}


def normalize_link(link):
    return link.split("?")[0] if link else None


def block_unnecessary(route):
    if route.request.resource_type in {"image", "font", "media"}:
        route.abort()
    else:
        route.continue_()


def clean_file_name(name):
    if name is None:
        return "no_name"
    clean_name = re.sub(r"[^\w\s-]", "", name)
    clean_name = clean_name.strip().replace(" ", "_")
    return clean_name[:50] or "no_name"


def html_to_description(html_text):
    if not html_text:
        return None
    text = html_text.replace("</p>", "\n").replace("<br>", "\n").replace("<br/>", "\n")
    text = re.sub(r"<[^>]+>", "", text)
    text = unescape(text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "<br>".join(lines)


def extract_description_from_html(text):
    match = re.search(r'"longDescription"\s*:\s*"((?:[^"\\]|\\.)*)"', text)
    if not match:
        return None
    try:
        decoded = json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        decoded = match.group(1)
    return html_to_description(decoded)


def extract_og_image(text):
    match = re.search(
        r'property=["\']og:image["\']\s+content=["\']([^"\']+)', text
    )
    return match.group(1) if match else None


def download_image(session, image_url, file_name, folder=IMAGES_FOLDER):
    if image_url is None:
        return None

    os.makedirs(folder, exist_ok=True)

    extension = image_url.split(".")[-1].split("?")[0]
    if len(extension) > 5 or "/" in extension:
        extension = "jpg"

    path = os.path.join(folder, f"{file_name}.{extension}")
    if os.path.exists(path):
        return path

    try:
        response = session.get(image_url, timeout=15)
        response.raise_for_status()
        with open(path, "wb") as f:
            f.write(response.content)
        return path
    except Exception as e:
        print(f"    Error downloading image: {e}")
        return None


def fetch_detail(session, item):
    idx, row = item
    url = row["link"]
    if url is None:
        return row

    try:
        response = session.get(url, headers=HEADERS, timeout=20)
        response.raise_for_status()
        text = response.text
    except Exception as e:
        print(f"    Error fetching detail: {e}")
        return row

    row["description"] = extract_description_from_html(text)
    row["image_url"] = extract_og_image(text)

    file_name = f"{idx:05d}_{clean_file_name(row['name'])}"
    row["local_image"] = download_image(session, row["image_url"], file_name)

    return row


def extract_listing_data(product):
    name_obj = product.query_selector(
        "xpath=//b[contains(@id, 'testId-pod-displaySubTitle')]"
    )
    brand_name_obj = product.query_selector("xpath=//b[contains(@class, 'pod-title')]")
    cmr_price_obj = product.query_selector("xpath=//li[@data-cmr-price]")
    internet_price_obj = product.query_selector("xpath=//li[@data-internet-price]")
    event_price_obj = product.query_selector("xpath=//li[@data-event-price]")
    normal_price_obj = product.query_selector("xpath=//li[@data-normal-price]")
    link_obj = product.query_selector("xpath=//a[contains(@class, 'pod-link')]")

    name = name_obj.inner_text() if name_obj else None
    brand_name = brand_name_obj.inner_text() if brand_name_obj else None
    cmr_price = cmr_price_obj.get_attribute("data-cmr-price") if cmr_price_obj else None
    internet_price = (
        internet_price_obj.get_attribute("data-internet-price")
        if internet_price_obj
        else None
    )
    event_price = (
        event_price_obj.get_attribute("data-event-price") if event_price_obj else None
    )
    normal_price = (
        normal_price_obj.get_attribute("data-normal-price")
        if normal_price_obj
        else None
    )
    link = link_obj.get_attribute("href") if link_obj else None

    return {
        "name": name,
        "brand_name": brand_name,
        "cmr_price": cmr_price,
        "internet_price": internet_price,
        "event_price": event_price,
        "normal_price": normal_price,
        "link": normalize_link(link),
    }


def load_existing():
    if not os.path.exists(OUTPUT_CSV_FILE):
        return [], set()
    df = pd.read_csv(OUTPUT_CSV_FILE)
    seen = set(df["link"].dropna().astype(str))
    return df.to_dict("records"), seen


def collect_listing(seen_links):
    listing = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.route("**/*", block_unnecessary)

        for category_name, base_url in categories.items():
            print(f"\n=== Category: {category_name} ===")
            category_counter = 0

            for page_number in range(1, 100):
                if category_counter >= LIMIT_PER_CATEGORY:
                    print(f"Limit of {LIMIT_PER_CATEGORY} reached for {category_name}")
                    break

                listing_url = f"{base_url}?page={page_number}"

                try:
                    page.goto(listing_url, timeout=20000)
                    page.wait_for_selector(
                        "xpath=//div[@pod-layout]", timeout=15000
                    )
                except Exception as e:
                    print(f"Error on page {page_number}: {e}")
                    continue

                products = page.query_selector_all("xpath=//div[@pod-layout]")

                if len(products) == 0:
                    print(f"Page {page_number} empty, moving to next category")
                    break

                print(f"Page {page_number}: {len(products)} products")

                for prod in products:
                    if category_counter >= LIMIT_PER_CATEGORY:
                        break

                    basic_data = extract_listing_data(prod)
                    if basic_data["link"] in seen_links:
                        continue

                    row = {
                        "category": category_name,
                        **basic_data,
                        "description": None,
                        "image_url": None,
                        "local_image": None,
                    }
                    listing.append(row)
                    category_counter += 1

        browser.close()

    return listing


def main():
    existing_rows, seen_links = load_existing()
    print(f"Resuming: {len(existing_rows)} rows already in {OUTPUT_CSV_FILE}")

    listing = collect_listing(seen_links)
    print(f"\nNew products to fetch details: {len(listing)}")

    session = requests.Session()
    session.headers.update(HEADERS)

    enriched = [None] * len(listing)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_to_idx = {
            executor.submit(fetch_detail, session, (idx, row)): idx
            for idx, row in enumerate(listing)
        }
        done = 0
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            enriched[idx] = future.result()
            done += 1
            if done % 20 == 0:
                print(f"  {done}/{len(listing)} details fetched")

    all_rows = existing_rows + [r for r in enriched if r is not None]

    df = pd.DataFrame(all_rows)
    df = df.drop_duplicates(subset=["link"])

    if os.path.isdir(IMAGES_FOLDER):
        kept = set(df["local_image"].dropna())
        for file_name in os.listdir(IMAGES_FOLDER):
            path = os.path.join(IMAGES_FOLDER, file_name)
            if path not in kept:
                os.remove(path)

    df.to_csv(OUTPUT_CSV_FILE, index=False)

    print("\n=== SUMMARY ===")
    print(df.groupby("category").size())
    print(f"\nSaved to: {OUTPUT_CSV_FILE}")
    print(f"Images in: {IMAGES_FOLDER}/")

    return df


if __name__ == "__main__":
    main()
