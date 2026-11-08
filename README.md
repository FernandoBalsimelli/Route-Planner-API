# Route Planner API

API Fastify para geocodificar direcciones y calcular recorridos con OpenRouteService (HeiGIT).

## Variables de entorno
- ORS_API_KEY: clave gratuita de HeiGIT/OpenRouteService. Solo en el backend de Vercel; nunca usar prefijo NEXT_PUBLIC_.
- SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY: validación de sesiones.
- ALLOWED_ORIGINS: orígenes web permitidos separados por coma.

## Endpoints
- GET /health — salud y disponibilidad de OpenRouteService (sin revelar secretos).
- GET /v1 — capacidades y estado.
- POST /v1/routes/validate — valida payload.
- POST /v1/routes/plan — requiere Authorization: Bearer <session>; geocodifica y calcula. Límite: 10 solicitudes por minuto por IP.

## Errores del proveedor

La API distingue errores de acceso de HeiGIT (`ORS_ACCESS_DENIED`), restricciones del nivel de clave (`ORS_PLAN_RESTRICTION`), límites de solicitudes (`ORS_RATE_LIMIT`) y tiempos de espera (`ORS_TIMEOUT`). Estos códigos permiten mostrar mensajes útiles sin exponer la clave ni los detalles internos del proveedor.

## Perfiles
- Reparto: driving-car.
- Transporte pesado: driving-hgv, vehicle_type hgv y restricciones de altura, ancho, largo, peso bruto y carga por eje en metros/toneladas.

Las restricciones solo se aplican donde la cartografía contiene los datos correspondientes. La cobertura en México puede ser incompleta: el resultado no garantiza que una vía sea legal o físicamente transitable para el camión. Verifica señalización y normativa local antes de circular.

## API alojada
Host vigente: https://api.heigit.org
- Geocodificación: /pelias/v1/search
- Rutas: /openrouteservice/v2/directions/{profile}/json

## Desarrollo
npm install && npm run dev
