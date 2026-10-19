// Shared by the server layout (inline script) and the client theme store.
export const THEME_KEY = "iap.theme";

/** Runs in <head> before first paint: saved choice, else the system preference. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
