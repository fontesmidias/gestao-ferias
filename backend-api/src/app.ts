import { join } from 'node:path'
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload'
import { FastifyPluginAsync, FastifyServerOptions } from 'fastify'
import { LOG_REDACT_PATHS, logRedactCensor } from './lib/log-redact'

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {

}
// LGPD (Story 5.2): logger.redact remove dados sensíveis ANTES da emissão de
// qualquer log. Cobre bankData.*, cpf (mascarado), personalData,
// chavePix/agencia/conta/banco/tipoPix/tipoConta + variantes em arrays.
//
// IMPORTANTE: estas options só são aplicadas quando fastify-cli é invocado com
// flag `--options`. Os scripts `start`/`dev:start` em package.json INCLUEM essa
// flag — sem ela, fastify-cli ignora silenciosamente o logger.redact e PII
// vaza nos logs em prod. NÃO REMOVA `--options` dos scripts.
const options: AppOptions = {
  logger: {
    redact: {
      paths: LOG_REDACT_PATHS,
      censor: logRedactCensor,
    },
  },
}

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts
): Promise<void> => {
  // Place here your custom code!

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  // eslint-disable-next-line no-void
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts
  })

  // This loads all plugins defined in routes
  // define your routes in one of these
  // eslint-disable-next-line no-void
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: opts
  })
}

export default app
export { app, options }
