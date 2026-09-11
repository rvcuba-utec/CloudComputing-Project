FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY main.go .

RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/cloudshop-catalogo .

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S cloudshop \
    && adduser -S cloudshop -G cloudshop

COPY --from=builder /out/cloudshop-catalogo /usr/local/bin/cloudshop-catalogo

USER cloudshop

EXPOSE 8080

ENTRYPOINT ["cloudshop-catalogo"]
