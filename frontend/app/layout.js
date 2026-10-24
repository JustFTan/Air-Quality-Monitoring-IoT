import "@fontsource-variable/schibsted-grotesk";
import "./globals.css";
import AppProvider from "@/components/AppContext";
import Shell from "@/components/Shell";

export const metadata = {
  title: "Pantau Udara",
  description: "Dashboard kualitas udara: CO₂, PM2.5, suhu, dan kelembapan dari sensor ESP32.",
};

// Terapkan tema tersimpan sebelum render supaya tidak berkedip.
const themeScript = `try{var t=localStorage.getItem('aq-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
