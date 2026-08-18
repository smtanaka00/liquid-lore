import '../styles/globals.css'
import type { AppProps } from 'next/app'
import Head from 'next/head'
import { ThemeProvider } from 'next-themes'
import { ConnectivityToast } from '../components/ConnectivityToast'

export default function App({ Component, pageProps }: AppProps) {
    return (
        <ThemeProvider attribute="class" defaultTheme="dark">
            <Head>
                <title>Liquid Lore</title>
                <meta name="description" content="The Premium Mixology Suite" />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
                <meta name="theme-color" content="#09090b" />
                <link rel="manifest" href="/manifest.json" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="apple-mobile-web-app-title" content="Liquid Lore" />
                <link rel="apple-touch-icon" href="/icons/icon-192.png" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="application-name" content="Liquid Lore" />
            </Head>
            
            <Component {...pageProps} />
            <ConnectivityToast />
        </ThemeProvider>
    )
}
