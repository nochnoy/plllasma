const PROXY_CONFIG = [
  {
    context: [
      '/attachments-new/**',
    ],
    target: 'https://plllasma.ru',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug'
  },
  {
    context: [
      '/',
    ],
    target: 'https://plllasma.ru',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    cookieDomainRewrite: 'localhost'
  }
]

module.exports = PROXY_CONFIG;
