import { app } from './index.js';

try {
  await app.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
