import { validateEnv } from './env';

export default () => validateEnv(process.env as Record<string, unknown>);
