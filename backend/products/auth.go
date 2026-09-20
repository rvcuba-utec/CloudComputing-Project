package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// claims son los campos del JWT HS256 emitido por el microservicio de usuarios
// (Backend/users-address). Se verifican a mano con la librería estándar para no
// depender de un módulo Go externo cuyo go.sum no se pueda regenerar sin conexión.
type claims struct {
	Sub string `json:"sub"`
	Rol string `json:"rol"`
	Exp int64  `json:"exp"`
}

func base64URLDecode(segment string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(segment)
}

func parseAndVerifyJWT(tokenString, secret string) (claims, error) {
	var resultado claims

	partes := strings.Split(tokenString, ".")
	if len(partes) != 3 {
		return resultado, fmt.Errorf("formato de token inválido")
	}
	cabecera, cuerpo, firma := partes[0], partes[1], partes[2]

	firmaEsperada := hmac.New(sha256.New, []byte(secret))
	firmaEsperada.Write([]byte(cabecera + "." + cuerpo))
	firmaCalculada := base64.RawURLEncoding.EncodeToString(firmaEsperada.Sum(nil))

	if !hmac.Equal([]byte(firmaCalculada), []byte(firma)) {
		return resultado, fmt.Errorf("firma del token inválida")
	}

	payloadCrudo, err := base64URLDecode(cuerpo)
	if err != nil {
		return resultado, fmt.Errorf("payload del token no es base64url válido: %w", err)
	}

	if err := json.Unmarshal(payloadCrudo, &resultado); err != nil {
		return resultado, fmt.Errorf("payload del token no es JSON válido: %w", err)
	}

	if resultado.Exp == 0 || time.Now().Unix() > resultado.Exp {
		return resultado, fmt.Errorf("el token ha expirado")
	}

	return resultado, nil
}

func extraerBearer(c *gin.Context) (string, bool) {
	cabecera := c.GetHeader("Authorization")
	const prefijo = "Bearer "
	if !strings.HasPrefix(cabecera, prefijo) {
		return "", false
	}
	return strings.TrimPrefix(cabecera, prefijo), true
}

// verificarToken extrae y valida el Bearer token, escribiendo la respuesta de error
// correspondiente si falta o es inválido. No debe llamarse dentro de otro handler vía
// una llamada directa que a su vez invoque c.Next(): en Gin, c.Next() avanza la cadena
// de middlewares compartida por *gin.Context, así que invocarlo desde dentro de una
// función que no es el handler actualmente en ejecución salta directamente al handler
// final antes de completar las validaciones posteriores (p. ej. el chequeo de rol).
func verificarToken(c *gin.Context, secret string) (claims, bool) {
	token, ok := extraerBearer(c)
	if !ok {
		responderError(c, http.StatusUnauthorized, "TOKEN_FALTANTE", "Se requiere un token de acceso Bearer")
		return claims{}, false
	}

	datosClaims, err := parseAndVerifyJWT(token, secret)
	if err != nil {
		responderError(c, http.StatusUnauthorized, "TOKEN_INVALIDO", fmt.Sprintf("Token de acceso inválido: %v", err))
		return claims{}, false
	}

	return datosClaims, true
}

// requireAuth exige un token Bearer válido y expone las claims en el contexto.
func requireAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		datosClaims, ok := verificarToken(c, secret)
		if !ok {
			return
		}
		c.Set("claims", datosClaims)
		c.Next()
	}
}

// requireAdmin exige, además de un token válido, que el rol del token sea "admin".
func requireAdmin(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		datosClaims, ok := verificarToken(c, secret)
		if !ok {
			return
		}
		if datosClaims.Rol != "admin" {
			responderError(c, http.StatusForbidden, "PERMISO_DENEGADO", "Esta acción requiere permisos de administrador")
			return
		}
		c.Set("claims", datosClaims)
		c.Next()
	}
}
