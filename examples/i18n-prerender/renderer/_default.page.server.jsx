import ReactDOMServer from 'react-dom/server'
import React from 'react'
import { escapeInject, dangerouslySkipEscape } from 'vite-plugin-ssr'
import { PageWrapper } from './PageWrapper'
import { localeDefault, locales } from '../locales'

export { render }
export { passToClient }
export { onBeforePrerender }

const passToClient = ['pageProps', 'locale']

function render(pageContext) {
  const { Page, pageProps } = pageContext
  const pageHtml = ReactDOMServer.renderToString(
    <PageWrapper pageContext={pageContext}>
      <Page {...pageProps} />
    </PageWrapper>
  )

  return escapeInject`<!DOCTYPE html>
    <html>
      <body>
        <div id="page-view">${dangerouslySkipEscape(pageHtml)}</div>
      </body>
    </html>`
}

function onBeforePrerender(globalContext) {
  const prerenderPageContexts = []
  globalContext.prerenderPageContexts.forEach((pageContext) => {
    prerenderPageContexts.push({
      ...pageContext,
      locale: localeDefault
    })
    locales
      .filter((locale) => locale !== localeDefault)
      .forEach((locale) => {
        prerenderPageContexts.push({
          ...pageContext,
          url: `/${locale}${pageContext.url}`,
          locale
        })
      })
  })
  return {
    globalContext: {
      prerenderPageContexts
    }
  }
}
