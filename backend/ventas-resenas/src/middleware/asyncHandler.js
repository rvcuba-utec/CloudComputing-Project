// Express 4 no reenvía rechazos de promesas al middleware de errores automáticamente;
// sin este wrapper, un error de Mongo dentro de un handler async dejaría la request colgada.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
