// Тестам нужен валидный env, чтобы импортировать модули, тянущие config.ts.
// БД не используется (postgres-js подключается лениво, запросов в тестах нет).
process.env.BOT_TOKEN ??= '123456:TEST-TOKEN-FOR-UNIT-TESTS';
process.env.ADMIN_ID ??= '5453071067';
process.env.TONAPI_KEY ??= 'test-key';
process.env.DATABASE_URL ??= 'postgres://tracker:tracker@localhost:5432/tracker';
