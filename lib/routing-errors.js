export function providerError(payload) {
  return {
    code: Number.isInteger(payload?.error?.code) ? payload.error.code : undefined,
    message: typeof payload?.error === 'string' ? payload.error
      : typeof payload?.error?.message === 'string' ? payload.error.message
      : typeof payload?.message === 'string' ? payload.message : '',
  };
}

export function routingFailure(status, error, routedPoints, originalPoints = routedPoints) {
  const { code, message } = error;
  if (code === 2010 || /could not find (?:routable )?point/i.test(message)) {
    const match = message.match(/(?:specified coordinate|could not find point)\s+(\d+)\s*:/i);
    const routedIndex = match ? Number(match[1]) : -1;
    const point = routedPoints[routedIndex];
    const index = point ? originalPoints.indexOf(point) : -1;
    const name = index === 0 ? 'El origen' : index === originalPoints.length - 1 ? 'El destino'
      : index > 0 ? `La parada ${index}` : 'Uno de los puntos';
    const radiusMatch = message.match(/radius of\s+(\d+(?:\.\d+)?)\s*meters/i);
    const radius = radiusMatch ? Number(radiusMatch[1]) : undefined;
    return {
      status: 422, ok: false, code: 'ORS_POINT_NOT_ROUTABLE',
      message: `${name}${point?.label ? ` «${point.label}»` : ''} no tiene una vía transitable para este vehículo${radius ? ` a menos de ${radius} m` : ' cerca del punto elegido'}. Busca una dirección concreta o un acceso cercano y vuelve a confirmar ese punto.`,
      ...(index >= 0 ? { waypointIndex: index, waypoint: { ...point, type: index === 0 ? 'origin' : index === originalPoints.length - 1 ? 'destination' : 'stop' } } : {}),
      ...(radius ? { searchRadiusMeters: radius } : {}),
    };
  }
  if (code === 2004 || /exceed.*(?:limit|distance)/i.test(message)) {
    const limit = message.match(/distance.*?greater than\s+(\d+(?:\.\d+)?)\s*meters/i);
    return {
      status: 422, ok: false, code: /distance/i.test(message) ? 'ORS_ROUTE_TOO_LONG' : 'ORS_LIMIT_EXCEEDED',
      message: /distance/i.test(message)
        ? `El recorrido supera el límite de distancia del proveedor${limit ? ` (${(Number(limit[1]) / 1000).toLocaleString('es-MX')} km)` : ''}. Revisa que todos los puntos estén en la ciudad correcta o divide el recorrido.`
        : 'La solicitud supera un límite del proveedor. Reduce el recorrido o revisa los datos del vehículo.',
    };
  }
  if ([2009, 2013, 2014, 2015, 2016].includes(code)) {
    return { status: 422, ok: false, code: 'ORS_NO_ROUTE', message: 'No existe una conexión transitable entre los puntos con este vehículo. Revisa los accesos y las restricciones del recorrido.' };
  }
  if (status >= 500) {
    return { status: 503, ok: false, code: 'ORS_ROUTING_UNAVAILABLE', message: 'El proveedor de rutas está temporalmente fuera de servicio. Intenta de nuevo en unos momentos.' };
  }
  return { status: 422, ok: false, code: 'ORS_ROUTING_FAILED', message: 'OpenRouteService no pudo calcular esta ruta. Revisa los puntos y los datos del vehículo.' };
}
