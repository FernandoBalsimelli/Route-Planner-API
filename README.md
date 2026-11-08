# Route Planner API

API Fastify para validar rutas y calcular recorridos con HERE Routing API v8.

## Variables
- `HERE_API_KEY`: clave secreta de HERE. Nunca se expone al navegador.
- `ALLOWED_ORIGINS`: orígenes web permitidos separados por coma.

## Endpoints
- `GET /health` — salud y disponibilidad de HERE (sin revelar secretos).
- `GET /v1` — capacidades y estado.
- `POST /v1/routes/validate` — valida payload.
- `POST /v1/routes/plan` — geocodifica los puntos y calcula la ruta con HERE.

## Desarrollo
`npm install && npm run dev`

Para camiones se envían dimensiones y pesos a HERE en centímetros y kilogramos. El motor aplica las restricciones que existan en la cartografía de HERE; no sustituye señalización ni revisión normativa local.
