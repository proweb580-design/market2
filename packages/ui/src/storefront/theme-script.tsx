/**
 * Applies the saved theme before first paint (see Next docs: preventing-flash-before-hydration).
 * Light is the default, as in the reference; dark only after the visitor picks it.
 * Render inside <head>; pair with suppressHydrationWarning on <html>.
 */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`,
      }}
    />
  );
}
