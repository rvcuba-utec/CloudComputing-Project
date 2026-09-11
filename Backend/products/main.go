package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
)

type config struct {
	MySQLHost     string
	MySQLPort     string
	MySQLUser     string
	MySQLPassword string
	MySQLDatabase string
	ServerPort    string
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func loadConfig() config {
	return config{
		MySQLHost:     envOrDefault("MYSQL_HOST", "localhost"),
		MySQLPort:     envOrDefault("MYSQL_PORT", "3306"),
		MySQLUser:     envOrDefault("MYSQL_USER", "cloud_user"),
		MySQLPassword: envOrDefault("MYSQL_PASSWORD", "cloud_pass"),
		MySQLDatabase: envOrDefault("MYSQL_DATABASE", "cloudshop_catalogo"),
		ServerPort:    envOrDefault("PORT", "8080"),
	}
}

func (cfg config) dsn() string {
	return fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4&timeout=5s&readTimeout=10s&writeTimeout=10s",
		cfg.MySQLUser,
		cfg.MySQLPassword,
		cfg.MySQLHost,
		cfg.MySQLPort,
		cfg.MySQLDatabase,
	)
}

var db *sql.DB

func conectarBD(cfg config) (*sql.DB, error) {
	conexion, err := sql.Open("mysql", cfg.dsn())
	if err != nil {
		return nil, fmt.Errorf("dsn inválido: %w", err)
	}

	conexion.SetMaxOpenConns(25)
	conexion.SetMaxIdleConns(10)
	conexion.SetConnMaxLifetime(5 * time.Minute)
	conexion.SetConnMaxIdleTime(90 * time.Second)

	const intentosMaximos = 30
	var ultimoError error
	for intento := 1; intento <= intentosMaximos; intento++ {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		ultimoError = conexion.PingContext(ctx)
		cancel()
		if ultimoError == nil {
			return conexion, nil
		}
		log.Printf("[db] intento de conexión %d/%d fallido: %v", intento, intentosMaximos, ultimoError)
		time.Sleep(2 * time.Second)
	}

	_ = conexion.Close()
	return nil, fmt.Errorf("no fue posible conectar a MySQL tras %d intentos: %w", intentosMaximos, ultimoError)
}

type Producto struct {
	ID              int64   `json:"id"`
	CategoriaID     int64   `json:"categoria_id"`
	CategoriaNombre string  `json:"categoria_nombre"`
	SKU             string  `json:"sku"`
	Nombre          string  `json:"nombre"`
	Descripcion     string  `json:"descripcion"`
	Marca           string  `json:"marca"`
	ImagenURL       string  `json:"imagen_url"`
	OrigenURL       string  `json:"origen_url"`
	Precio          float64 `json:"precio"`
	PrecioOferta    float64 `json:"precio_oferta"`
	Activo          bool    `json:"activo"`
	StockDisponible int64   `json:"stock_disponible"`
	StockReservado  int64   `json:"stock_reservado"`
}

type Categoria struct {
	ID          int64  `json:"id"`
	Nombre      string `json:"nombre"`
	Descripcion string `json:"descripcion"`
}

type MovimientoStock struct {
	ID         int64     `json:"id"`
	ProductoID int64     `json:"producto_id"`
	Tipo       string    `json:"tipo"`
	Cantidad   int64     `json:"cantidad"`
	Fecha      time.Time `json:"fecha"`
}

type MovimientoRequest struct {
	ProductoID int64 `json:"producto_id"`
	Cantidad   int64 `json:"cantidad"`
}

const (
	tipoReserva         = "RESERVA"
	tipoLiberacion      = "LIBERACION"
	tipoVentaConfirmada = "VENTA_CONFIRMADA"
)

func responderError(c *gin.Context, status int, codigo, mensaje string) {
	c.AbortWithStatusJSON(status, gin.H{"error": gin.H{"code": codigo, "message": mensaje}})
}

func errorInterno(c *gin.Context, accion string, err error) {
	log.Printf("[db] error en %s: %v", accion, err)
	responderError(c, http.StatusInternalServerError, "ERROR_INTERNO", "Ocurrió un error interno del servidor")
}

const consultaBaseProductos = `
	SELECT
		p.id,
		p.categoria_id,
		c.nombre,
		p.sku,
		p.nombre,
		p.descripcion,
		p.marca,
		p.imagen_url,
		p.origen_url,
		p.precio,
		p.precio_oferta,
		p.activo,
		COALESCE(i.stock_disponible, 0),
		COALESCE(i.stock_reservado, 0)
	FROM productos AS p
	INNER JOIN categorias AS c ON c.id = p.categoria_id
	LEFT JOIN inventario AS i ON i.producto_id = p.id`

type escaneadorDeFilas interface {
	Scan(dest ...any) error
}

func escanearProducto(scanner escaneadorDeFilas) (Producto, error) {
	var producto Producto
	var descripcion, marca, imagenURL, origenURL sql.NullString
	var precioOferta sql.NullFloat64
	var activo int64
	err := scanner.Scan(
		&producto.ID,
		&producto.CategoriaID,
		&producto.CategoriaNombre,
		&producto.SKU,
		&producto.Nombre,
		&descripcion,
		&marca,
		&imagenURL,
		&origenURL,
		&producto.Precio,
		&precioOferta,
		&activo,
		&producto.StockDisponible,
		&producto.StockReservado,
	)
	producto.Descripcion = descripcion.String
	producto.Marca = marca.String
	producto.ImagenURL = imagenURL.String
	producto.OrigenURL = origenURL.String
	producto.PrecioOferta = precioOferta.Float64
	producto.Activo = activo == 1
	return producto, err
}

func handleHealth(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		log.Printf("[health] ping a MySQL falló: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "DOWN", "database": "DISCONNECTED"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "UP", "database": "CONNECTED"})
}

func parseEnteroPositivo(c *gin.Context, clave string, defecto, maximo int) (int, bool) {
	valorCrudo := strings.TrimSpace(c.Query(clave))
	if valorCrudo == "" {
		return defecto, true
	}
	valor, err := strconv.Atoi(valorCrudo)
	if err != nil || valor < 1 || (maximo > 0 && valor > maximo) {
		responderError(c, http.StatusBadRequest, "PARAMETRO_INVALIDO",
			fmt.Sprintf("El parámetro '%s' con valor '%s' no es válido", clave, valorCrudo))
		return 0, false
	}
	return valor, true
}

func construirFiltros(c *gin.Context) (string, []any, bool) {
	condiciones := make([]string, 0, 6)
	args := make([]any, 0, 6)

	if categoriaCruda := strings.TrimSpace(c.Query("categoria_id")); categoriaCruda != "" {
		categoriaID, err := strconv.ParseInt(categoriaCruda, 10, 64)
		if err != nil || categoriaID < 1 {
			responderError(c, http.StatusBadRequest, "PARAMETRO_INVALIDO",
				fmt.Sprintf("El parámetro 'categoria_id' con valor '%s' no es válido", categoriaCruda))
			return "", nil, false
		}
		condiciones = append(condiciones, "p.categoria_id = ?")
		args = append(args, categoriaID)
	}

	if texto := strings.TrimSpace(c.Query("q")); texto != "" {
		condiciones = append(condiciones, "(p.nombre LIKE ? OR p.marca LIKE ?)")
		patron := "%" + texto + "%"
		args = append(args, patron, patron)
	}

	for _, filtro := range []struct {
		clave    string
		operador string
	}{
		{"precio_min", ">="},
		{"precio_max", "<="},
	} {
		if valorCrudo := strings.TrimSpace(c.Query(filtro.clave)); valorCrudo != "" {
			precio, err := strconv.ParseFloat(valorCrudo, 64)
			if err != nil || precio < 0 {
				responderError(c, http.StatusBadRequest, "PARAMETRO_INVALIDO",
					fmt.Sprintf("El parámetro '%s' con valor '%s' no es válido", filtro.clave, valorCrudo))
				return "", nil, false
			}
			condiciones = append(condiciones, fmt.Sprintf("p.precio %s ?", filtro.operador))
			args = append(args, precio)
		}
	}

	if soloActivos := strings.TrimSpace(c.Query("solo_activos")); soloActivos != "" && strings.EqualFold(soloActivos, "true") {
		condiciones = append(condiciones, "p.activo = 1")
	}

	where := "1 = 1"
	if len(condiciones) > 0 {
		where = strings.Join(condiciones, " AND ")
	}
	return where, args, true
}

func handleListarProductos(c *gin.Context) {
	pagina, ok := parseEnteroPositivo(c, "page", 1, 0)
	if !ok {
		return
	}
	limite, ok := parseEnteroPositivo(c, "limit", 20, 100)
	if !ok {
		return
	}
	where, args, ok := construirFiltros(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	var total int64
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM productos AS p WHERE "+where, args...).Scan(&total); err != nil {
		errorInterno(c, "contar productos", err)
		return
	}

	consulta := consultaBaseProductos + " WHERE " + where +
		" ORDER BY p.id ASC LIMIT ? OFFSET ?"
	argsConsulta := append(append([]any{}, args...), limite, (pagina-1)*limite)

	rows, err := db.QueryContext(ctx, consulta, argsConsulta...)
	if err != nil {
		errorInterno(c, "listar productos", err)
		return
	}
	defer rows.Close()

	productos := make([]Producto, 0, limite)
	for rows.Next() {
		producto, err := escanearProducto(rows)
		if err != nil {
			errorInterno(c, "escanear producto", err)
			return
		}
		productos = append(productos, producto)
	}
	if err := rows.Err(); err != nil {
		errorInterno(c, "iterar resultados de productos", err)
		return
	}

	paginas := int64(0)
	if limite > 0 {
		paginas = (total + int64(limite) - 1) / int64(limite)
	}

	c.JSON(http.StatusOK, gin.H{
		"data":   productos,
		"total":  total,
		"page":   pagina,
		"limit":  limite,
		"pages":  paginas,
	})
}

func handleListarCategorias(c *gin.Context) {
	rows, err := db.QueryContext(c.Request.Context(), `
		SELECT id, nombre, descripcion FROM categorias ORDER BY nombre ASC`)
	if err != nil {
		errorInterno(c, "listar categorias", err)
		return
	}
	defer rows.Close()

	categorias := make([]Categoria, 0, 64)
	for rows.Next() {
		var categoria Categoria
		var descripcion sql.NullString
		if err := rows.Scan(&categoria.ID, &categoria.Nombre, &descripcion); err != nil {
			errorInterno(c, "escanear categoria", err)
			return
		}
		categoria.Descripcion = descripcion.String
		categorias = append(categorias, categoria)
	}
	if err := rows.Err(); err != nil {
		errorInterno(c, "iterar resultados de categorias", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": categorias, "total": len(categorias)})
}

func handleMovimientosProducto(c *gin.Context) {
	idCrudo := c.Param("id")
	id, err := strconv.ParseInt(idCrudo, 10, 64)
	if err != nil || id < 1 {
		responderError(c, http.StatusBadRequest, "PARAMETRO_INVALIDO",
			fmt.Sprintf("El valor '%s' no es un identificador de producto válido", idCrudo))
		return
	}
	limite, ok := parseEnteroPositivo(c, "limit", 20, 100)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	existe, err := existeProducto(ctx, db, id)
	if err != nil {
		errorInterno(c, "verificar existencia del producto", err)
		return
	}
	if !existe {
		responderError(c, http.StatusNotFound, "PRODUCTO_NO_ENCONTRADO",
			fmt.Sprintf("No existe el producto con id %d", id))
		return
	}

	rows, err := db.QueryContext(ctx, `
		SELECT id, producto_id, tipo, cantidad, fecha
		FROM movimientos_stock
		WHERE producto_id = ?
		ORDER BY fecha DESC, id DESC
		LIMIT ?`, id, limite)
	if err != nil {
		errorInterno(c, "listar movimientos", err)
		return
	}
	defer rows.Close()

	movimientos := make([]MovimientoStock, 0, limite)
	for rows.Next() {
		var mov MovimientoStock
		if err := rows.Scan(&mov.ID, &mov.ProductoID, &mov.Tipo, &mov.Cantidad, &mov.Fecha); err != nil {
			errorInterno(c, "escanear movimiento", err)
			return
		}
		movimientos = append(movimientos, mov)
	}
	if err := rows.Err(); err != nil {
		errorInterno(c, "iterar resultados de movimientos", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": movimientos, "producto_id": id, "total": len(movimientos)})
}

func handleObtenerProducto(c *gin.Context) {
	idCrudo := c.Param("id")
	id, err := strconv.ParseInt(idCrudo, 10, 64)
	if err != nil || id < 1 {
		responderError(c, http.StatusBadRequest, "PARAMETRO_INVALIDO",
			fmt.Sprintf("El valor '%s' no es un identificador de producto válido", idCrudo))
		return
	}

	query := consultaBaseProductos + " WHERE p.id = ?"

	producto, err := escanearProducto(db.QueryRowContext(c.Request.Context(), query, id))
	if errors.Is(err, sql.ErrNoRows) {
		responderError(c, http.StatusNotFound, "PRODUCTO_NO_ENCONTRADO",
			fmt.Sprintf("No existe el producto con id %d", id))
		return
	}
	if err != nil {
		errorInterno(c, "consultar producto", err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": producto})
}

type consultadorDeFilas interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func existeProducto(ctx context.Context, consultador consultadorDeFilas, id int64) (bool, error) {
	var total int64
	if err := consultador.QueryRowContext(ctx, "SELECT COUNT(*) FROM productos WHERE id = ?", id).Scan(&total); err != nil {
		return false, err
	}
	return total == 1, nil
}

func handleMovimientoStock(tipo string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req MovimientoRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			responderError(c, http.StatusBadRequest, "REQUEST_INVALIDA",
				"Cuerpo JSON inválido: se requieren los campos 'producto_id' y 'cantidad' (enteros positivos)")
			return
		}
		if req.ProductoID < 1 || req.Cantidad < 1 {
			responderError(c, http.StatusBadRequest, "PARAMETROS_INVALIDOS",
				"'producto_id' y 'cantidad' deben ser enteros mayores o iguales a 1")
			return
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			errorInterno(c, "iniciar transacción", err)
			return
		}
		defer func() {
			if err := tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
				log.Printf("[tx] error al hacer rollback: %v", err)
			}
		}()

		var disponible, reservado int64
		err = tx.QueryRowContext(ctx, `
			SELECT stock_disponible, stock_reservado
			FROM inventario
			WHERE producto_id = ?
			FOR UPDATE`, req.ProductoID).Scan(&disponible, &reservado)

		if errors.Is(err, sql.ErrNoRows) {
			existe, errExiste := existeProducto(ctx, tx, req.ProductoID)
			if errExiste != nil {
				errorInterno(c, "verificar existencia del producto", errExiste)
				return
			}
			if !existe {
				responderError(c, http.StatusNotFound, "PRODUCTO_NO_ENCONTRADO",
					fmt.Sprintf("No existe el producto con id %d", req.ProductoID))
			} else {
				responderError(c, http.StatusNotFound, "INVENTARIO_NO_ENCONTRADO",
					fmt.Sprintf("El producto %d no tiene registro de inventario", req.ProductoID))
			}
			return
		}
		if err != nil {
			errorInterno(c, "bloquear inventario (SELECT FOR UPDATE)", err)
			return
		}

		var (
			updateSQL       string
			args            []any
			mensaje         string
			nuevoDisponible = disponible
			nuevoReservado  = reservado
		)

		switch tipo {
		case tipoReserva:
			if req.Cantidad > disponible {
				responderError(c, http.StatusConflict, "STOCK_INSUFICIENTE",
					fmt.Sprintf("Stock disponible insuficiente: disponible=%d, solicitado=%d", disponible, req.Cantidad))
				return
			}
			updateSQL = "UPDATE inventario SET stock_disponible = stock_disponible - ?, stock_reservado = stock_reservado + ? WHERE producto_id = ?"
			args = []any{req.Cantidad, req.Cantidad, req.ProductoID}
			mensaje = "Stock reservado correctamente"
			nuevoDisponible -= req.Cantidad
			nuevoReservado += req.Cantidad

		case tipoLiberacion:
			if req.Cantidad > reservado {
				responderError(c, http.StatusConflict, "STOCK_RESERVADO_INSUFICIENTE",
					fmt.Sprintf("Stock reservado insuficiente: reservado=%d, solicitado=%d", reservado, req.Cantidad))
				return
			}
			updateSQL = "UPDATE inventario SET stock_reservado = stock_reservado - ?, stock_disponible = stock_disponible + ? WHERE producto_id = ?"
			args = []any{req.Cantidad, req.Cantidad, req.ProductoID}
			mensaje = "Stock liberado correctamente"
			nuevoReservado -= req.Cantidad
			nuevoDisponible += req.Cantidad

		case tipoVentaConfirmada:
			if req.Cantidad > reservado {
				responderError(c, http.StatusConflict, "STOCK_RESERVADO_INSUFICIENTE",
					fmt.Sprintf("Stock reservado insuficiente: reservado=%d, solicitado=%d", reservado, req.Cantidad))
				return
			}
			updateSQL = "UPDATE inventario SET stock_reservado = stock_reservado - ? WHERE producto_id = ?"
			args = []any{req.Cantidad, req.ProductoID}
			mensaje = "Venta confirmada: stock descontado del inventario"
			nuevoReservado -= req.Cantidad
		}

		resultado, err := tx.ExecContext(ctx, updateSQL, args...)
		if err != nil {
			errorInterno(c, "actualizar inventario", err)
			return
		}
		if filas, errFilas := resultado.RowsAffected(); errFilas != nil || filas != 1 {
			errorInterno(c, "actualizar inventario", fmt.Errorf("se esperaba actualizar 1 renglón, se actualizaron %d (err=%v)", filas, errFilas))
			return
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO movimientos_stock (producto_id, tipo, cantidad, fecha)
			VALUES (?, ?, ?, NOW())`, req.ProductoID, tipo, req.Cantidad)
		if err != nil {
			errorInterno(c, "registrar movimiento de stock", err)
			return
		}

		if err := tx.Commit(); err != nil {
			errorInterno(c, "confirmar transacción", err)
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": mensaje,
			"data": gin.H{
				"producto_id":      req.ProductoID,
				"tipo":             tipo,
				"cantidad":         req.Cantidad,
				"stock_disponible": nuevoDisponible,
				"stock_reservado":  nuevoReservado,
			},
		})
	}
}

func configurarRutas() *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	router.GET("/health", handleHealth)

	api := router.Group("/api/catalogo")
	{
		api.GET("/categorias", handleListarCategorias)
		api.GET("/productos", handleListarProductos)
		api.GET("/productos/:id", handleObtenerProducto)
		api.GET("/productos/:id/movimientos", handleMovimientosProducto)
		api.POST("/inventario/reservar", handleMovimientoStock(tipoReserva))
		api.POST("/inventario/liberar", handleMovimientoStock(tipoLiberacion))
		api.POST("/inventario/confirmar-venta", handleMovimientoStock(tipoVentaConfirmada))
	}

	return router
}

func main() {
	cfg := loadConfig()

	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	var err error
	db, err = conectarBD(cfg)
	if err != nil {
		log.Fatalf("[main] %v", err)
	}
	defer db.Close()
	log.Printf("[main] conexión a MySQL establecida (%s:%s/%s)", cfg.MySQLHost, cfg.MySQLPort, cfg.MySQLDatabase)

	servidor := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      configurarRutas(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	ctxSenal, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("[main] servicio de catálogo e inventario escuchando en :%s", cfg.ServerPort)
		if err := servidor.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[main] error al iniciar el servidor HTTP: %v", err)
		}
	}()

	<-ctxSenal.Done()
	log.Println("[main] señal de terminación recibida, cerrando el servicio...")

	ctxApagado, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := servidor.Shutdown(ctxApagado); err != nil {
		log.Printf("[main] error durante el apagado gracible: %v", err)
	}

	log.Println("[main] servicio detenido correctamente")
}
