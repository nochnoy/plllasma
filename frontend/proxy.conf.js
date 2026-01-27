const PROXY_CONFIG = [
  {
    context: [
      '/api/**',
    ],
    target: 'https://plllasma.ru',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    cookieDomainRewrite: 'localhost'
  },
  {
    context: [
      '/a/**',
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
