// ========================
// Estadísticas de uso con GoatCounter (sin cookies)
// Solo se envían conteos: aperturas y eventos como "registro-gasto". Nunca nombres, valores ni registros.
// ========================
const GOATCOUNTER_CODIGO = 'tudesarrollador';

function esAppInstalada() {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function cargarAnalitica() {
    if (!GOATCOUNTER_CODIGO || location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost') return;
    // La apertura se cuenta separando app instalada de navegador
    window.goatcounter = {
        path: () => '/miniapps/finanzas/' + (esAppInstalada() ? 'app-instalada' : 'navegador')
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://gc.zgo.at/count.js';
    script.dataset.goatcounter = `https://${GOATCOUNTER_CODIGO}.goatcounter.com/count`;
    document.head.appendChild(script);
}

// GoatCounter ignora este dispositivo si existe "skipgc" en localStorage
function contarEsteDispositivo() {
    return localStorage.getItem('skipgc') !== 't';
}

function cambiarConteoDispositivo(contar) {
    if (contar) localStorage.removeItem('skipgc');
    else localStorage.setItem('skipgc', 't');
    toast(contar ? 'Este dispositivo se contará en las estadísticas.' : 'Este dispositivo ya no se cuenta en las estadísticas.');
}

function contarEvento(nombre) {
    if (!GOATCOUNTER_CODIGO || !contarEsteDispositivo()) return;
    try {
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({ path: nombre, title: nombre, event: true });
        }
    } catch (err) {
        // Las estadísticas nunca deben interrumpir el uso de la app
    }
}

document.addEventListener('DOMContentLoaded', () => {
    cargarAnalitica();
    const casilla = document.getElementById('contarDispositivo');
    if (casilla) {
        casilla.checked = contarEsteDispositivo();
        casilla.addEventListener('change', () => cambiarConteoDispositivo(casilla.checked));
    }
    window.addEventListener('appinstalled', () => contarEvento('app-instalada'));
});
