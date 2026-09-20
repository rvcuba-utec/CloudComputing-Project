"""Cliente delgado sobre boto3 Athena: ejecuta una consulta y devuelve filas como dicts.

Usa las credenciales del IAM Role de la instancia (blueprint §7/§9) — nunca credenciales
hardcodeadas. Sin ``ATHENA_OUTPUT_S3`` configurado, ``ejecutar_consulta`` lanza
``AthenaNoConfigurado`` para que el router responda 503 en vez de fallar de forma opaca.
"""

import time

import boto3

from ..config import settings


class AthenaNoConfigurado(Exception):
    pass


class AthenaConsultaFallida(Exception):
    pass


def _cliente():
    return boto3.client("athena", region_name=settings.AWS_REGION)


def ejecutar_consulta(sql: str, intervalo_seg: float = 1.0, intentos_maximos: int = 30) -> list[dict]:
    if not settings.athena_configurado:
        raise AthenaNoConfigurado("Falta configurar ATHENA_OUTPUT_S3 (bucket de resultados de Athena)")

    athena = _cliente()

    ejecucion = athena.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": settings.ATHENA_DATABASE},
        ResultConfiguration={"OutputLocation": settings.ATHENA_OUTPUT_S3},
        WorkGroup=settings.ATHENA_WORKGROUP,
    )
    execution_id = ejecucion["QueryExecutionId"]

    estado = "RUNNING"
    for _ in range(intentos_maximos):
        detalle = athena.get_query_execution(QueryExecutionId=execution_id)
        estado = detalle["QueryExecution"]["Status"]["State"]
        if estado in ("SUCCEEDED", "FAILED", "CANCELLED"):
            break
        time.sleep(intervalo_seg)

    if estado != "SUCCEEDED":
        razon = detalle["QueryExecution"]["Status"].get("StateChangeReason", "sin detalle")
        raise AthenaConsultaFallida(f"La consulta terminó en estado '{estado}': {razon}")

    filas: list[dict] = []
    encabezados: list[str] | None = None
    paginador = athena.get_paginator("get_query_results")
    for pagina in paginador.paginate(QueryExecutionId=execution_id):
        for fila in pagina["ResultSet"]["Rows"]:
            valores = [campo.get("VarCharValue", "") for campo in fila.get("Data", [])]
            if encabezados is None:
                encabezados = valores
                continue
            filas.append(dict(zip(encabezados, valores)))

    return filas
