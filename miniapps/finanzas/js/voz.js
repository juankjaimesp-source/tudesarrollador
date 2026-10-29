// ========================
// Intérprete de frases dictadas (reglas locales, sin internet)
// Ej: "le presté 50 mil a Juan por almuerzo ayer"
//     "Pedro me pagó veinte mil quinientos"
// ========================
(function (global) {

    function normalizar(texto) {
        return (texto || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[¿?¡!;:"()]/g, ' ')
            // Comas y puntos que no separan dígitos ("Pedro, 22 mil" / "50.000" se respeta)
            .replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // ========================
    // Números en palabras
    // ========================
    const UNIDADES = {
        cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
        diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
        dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22,
        veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
        veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
        noventa: 90, cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
        cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
        setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
        medio: 0.5, media: 0.5
    };
    // "lucas" = mil pesos, "palos" = millón (jerga colombiana)
    const MILES = ['mil', 'luca', 'lucas', 'k'];
    const MILLONES = ['millon', 'millones', 'palo', 'palos', 'melon', 'melones'];

    function esMultiplicador(tok) {
        return MILES.includes(tok) || MILLONES.includes(tok);
    }

    // Convierte un token numérico con dígitos: "50.000", "50,000", "1.5", "50k", "$20.000"
    function numeroDeDigitos(tok, siguienteEsMultiplicador) {
        let t = tok.replace(/^\$/, '');
        let multiplicador = 1;
        if (/^\d+([.,]\d+)?k$/.test(t)) { multiplicador = 1000; t = t.slice(0, -1); }
        if (!/^\d[\d.,]*$/.test(t)) return null;
        let valor;
        if (/^\d{1,3}([.,]\d{3})+$/.test(t)) {
            // Separadores de miles: 50.000 / 1,250,000
            valor = parseInt(t.replace(/[.,]/g, ''), 10);
        } else if (/^\d+[.,]\d{1,2}$/.test(t)) {
            // Decimal: 1.5 millones / 2,5 mil (o centavos)
            valor = parseFloat(t.replace(',', '.'));
            if (!siguienteEsMultiplicador && multiplicador === 1) valor = Math.round(valor);
        } else {
            valor = parseInt(t.replace(/[.,]/g, ''), 10);
        }
        return isNaN(valor) ? null : valor * multiplicador;
    }

    // Reemplaza secuencias numéricas (palabras y dígitos) por un token "#<valor>"
    function convertirNumeros(textoNorm) {
        const tokens = textoNorm.split(' ');
        const salida = [];
        let i = 0;

        while (i < tokens.length) {
            const esInicio = (j) => {
                const tok = tokens[j];
                if (tok === undefined) return false;
                if (/^\$?\d/.test(tok)) return true;
                if (tok === 'mil') return true;
                if (UNIDADES[tok] !== undefined) {
                    // "un/una/uno/medio" solo cuentan como número si les sigue otro número o multiplicador
                    if (['un', 'una', 'uno', 'medio', 'media'].includes(tok)) {
                        const sig = tokens[j + 1];
                        return sig !== undefined && (esMultiplicador(sig) || UNIDADES[sig] !== undefined && !['un', 'una', 'uno'].includes(sig));
                    }
                    return true;
                }
                return false;
            };

            if (!esInicio(i)) { salida.push(tokens[i]); i++; continue; }

            let total = 0, actual = 0, consumidos = 0, huboValor = false;
            let j = i;
            while (j < tokens.length) {
                const tok = tokens[j];
                const sig = tokens[j + 1];
                const digitos = /^\$?\d/.test(tok) ? numeroDeDigitos(tok, sig !== undefined && esMultiplicador(sig)) : null;

                if (digitos !== null) {
                    // Dos cifras seguidas en dígitos = dos números distintos
                    if (huboValor && actual !== 0 && actual % 1000 !== 0) break;
                    actual += digitos; huboValor = true;
                } else if (UNIDADES[tok] !== undefined && !(huboValor && ['un', 'una', 'uno'].includes(tok) && !(sig && esMultiplicador(sig)))) {
                    actual += UNIDADES[tok]; huboValor = true;
                } else if (MILES.includes(tok) && (huboValor || tok === 'mil')) {
                    actual = (actual || 1) * 1000; huboValor = true;
                } else if (MILLONES.includes(tok) && huboValor) {
                    total += (actual || 1) * 1000000; actual = 0;
                } else if (tok === 'y' && huboValor && sig !== undefined && (UNIDADES[sig] !== undefined || /^\d/.test(sig))) {
                    // "treinta y cinco"
                } else if (tok === 'de' && huboValor && actual === 0 && total > 0 && sig === 'pesos') {
                    // "dos millones de pesos"
                } else {
                    break;
                }
                j++; consumidos++;
            }

            if (consumidos === 0) { salida.push(tokens[i]); i++; continue; }
            salida.push('#' + Math.round(total + actual));
            i = j;
        }
        return salida.join(' ');
    }

    // ========================
    // Fechas
    // ========================
    const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
    const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
        septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

    function aISO(d) {
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${m}-${dia}`;
    }

    function restarDias(base, n) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
        d.setDate(d.getDate() - n);
        return d;
    }

    // Devuelve { fecha: 'YYYY-MM-DD' | null, texto: texto sin la expresión de fecha }
    function extraerFecha(texto, hoy) {
        const quitar = (re) => texto.replace(re, ' ').replace(/\s+/g, ' ').trim();
        let m;

        if ((m = texto.match(/\b(antier|anteayer|antes de ayer)\b/))) {
            return { fecha: aISO(restarDias(hoy, 2)), texto: quitar(m[0]) };
        }
        if ((m = texto.match(/\bayer\b/))) return { fecha: aISO(restarDias(hoy, 1)), texto: quitar(/\bayer\b/) };
        if ((m = texto.match(/\bhoy\b/))) return { fecha: aISO(hoy), texto: quitar(/\bhoy\b/) };

        if ((m = texto.match(/\bhace (#\d+|un|una) (dia|dias|semana|semanas)\b/))) {
            const n = m[1].startsWith('#') ? parseInt(m[1].slice(1), 10) : 1;
            const dias = m[2].startsWith('semana') ? n * 7 : n;
            return { fecha: aISO(restarDias(hoy, dias)), texto: quitar(m[0]) };
        }

        // "el 15 de octubre", "15 de octubre"
        const reMes = new RegExp(`\\b(?:el )?#(\\d{1,2}) de (${Object.keys(MESES).join('|')})\\b`);
        if ((m = texto.match(reMes))) {
            const dia = parseInt(m[1], 10);
            const mes = MESES[m[2]];
            let anio = hoy.getFullYear();
            let d = new Date(anio, mes - 1, dia);
            if (d > hoy) d = new Date(anio - 1, mes - 1, dia);
            if (dia >= 1 && dia <= 31) return { fecha: aISO(d), texto: quitar(m[0]) };
        }

        // "15/10" o "15-10-2026"
        if ((m = texto.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/))) {
            const dia = parseInt(m[1], 10), mes = parseInt(m[2], 10);
            let anio = m[3] ? parseInt(m[3], 10) : hoy.getFullYear();
            if (anio < 100) anio += 2000;
            if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
                let d = new Date(anio, mes - 1, dia);
                if (!m[3] && d > hoy) d = new Date(anio - 1, mes - 1, dia);
                return { fecha: aISO(d), texto: quitar(m[0]) };
            }
        }

        // "el lunes", "el viernes pasado", "el pasado martes"
        const reDia = new RegExp(`\\b(?:el )?(?:pasado )?(${Object.keys(DIAS).join('|')})(?: pasado)?\\b`);
        if ((m = texto.match(reDia))) {
            let atras = (hoy.getDay() - DIAS[m[1]] + 7) % 7;
            if (atras === 0) atras = 7;
            return { fecha: aISO(restarDias(hoy, atras)), texto: quitar(m[0]) };
        }

        // "el 15" (día del mes actual, o del anterior si aún no llega)
        if ((m = texto.match(/\bel #(\d{1,2})\b(?! ?(mil|millon|lucas?|palos?))/))) {
            const dia = parseInt(m[1], 10);
            if (dia >= 1 && dia <= 31) {
                let d = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
                if (d > hoy) d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, dia);
                return { fecha: aISO(d), texto: quitar(m[0]) };
            }
        }

        return { fecha: null, texto };
    }

    // ========================
    // Tipo de movimiento
    // ========================
    // pago = la persona me paga / abona; gasto = le presto o pago algo por ella (queda debiendo)
    const PATRONES_PAGO = [
        /\bme (pago|pagaron|abono|abonaron|devolvio|devolvieron|dio|consigno|transfirio|giro|cancelo|mando|envio|paso|entrego)\b/,
        /\b(recibi|abono|abonos|devolvio|devolucion|cancelo)\b/,
        /\b(pago|pagaron)\b(?! (el|la|los|las|un|una|por))/,
        /\bpago de\b/
    ];
    const PATRONES_GASTO = [
        /\ble (preste|di|pague|compre|fie|gire|consigne|mande|envie|pase|entregue)\b/,
        /\b(preste|prestamo|fie|fiado|pague|compre|invite|gaste|gasto|debe|deuda|presto)\b/
    ];

    function detectarTipo(texto) {
        // Primero los "me ..." (la persona me da plata) porque son más específicos
        if (PATRONES_PAGO[0].test(texto)) return 'pago';
        if (PATRONES_GASTO[0].test(texto)) return 'gasto';
        if (PATRONES_GASTO[1].test(texto)) return 'gasto';
        for (let i = 1; i < PATRONES_PAGO.length; i++) {
            if (PATRONES_PAGO[i].test(texto)) return 'pago';
        }
        return null;
    }

    // ========================
    // Coincidencias con personas y conceptos existentes
    // ========================
    function escaparRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function contienePalabras(texto, frase) {
        if (!frase) return false;
        const re = new RegExp(`(^|\\s)${escaparRegex(frase)}(es|s)?(\\s|$)`);
        return re.test(texto);
    }

    function buscarConcepto(texto, conceptos) {
        let mejor = null;
        conceptos.forEach(c => {
            const n = normalizar(c.nombre);
            if (contienePalabras(texto, n) && (!mejor || n.length > normalizar(mejor.nombre).length)) mejor = c;
        });
        return mejor;
    }

    function buscarPersona(texto, nombres) {
        // 1) nombre completo
        let mejor = null;
        nombres.forEach(nombre => {
            const n = normalizar(nombre);
            if (contienePalabras(texto, n) && (!mejor || n.length > normalizar(mejor).length)) mejor = nombre;
        });
        if (mejor) return mejor;

        // 2) solo el primer nombre, si no es ambiguo
        const porPrimerNombre = nombres.filter(nombre => {
            const primero = normalizar(nombre).split(' ')[0];
            return primero.length > 2 && contienePalabras(texto, primero);
        });
        return porPrimerNombre.length === 1 ? porPrimerNombre[0] : null;
    }

    const NO_NOMBRES = new Set([
        'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'mi', 'mis', 'su', 'sus', 'me', 'le', 'les', 'lo',
        'por', 'para', 'de', 'del', 'a', 'al', 'con', 'en', 'y', 'o', 'que', 'pesos', 'plata', 'dinero', 'hoy', 'ayer',
        'pago', 'pague', 'pagaron', 'abono', 'preste', 'prestamo', 'presto', 'debe', 'deuda', 'gasto', 'nota', 'comentario',
        'registra', 'registrar', 'anota', 'anotar', 'apunta', 'apuntar', 'recibi', 'dio', 'di', 'compre', 'fie',
        'devolvio', 'cancelo', 'efectivo', 'nequi', 'daviplata', 'transferencia', 'cuenta', 'semana', 'mes', 'dia',
        'favor', 'concepto', 'valor', 'total', 'parte', 'resto', 'mitad', 'cuota',
        'interes', 'intereses', 'mensual', 'ciento', 'tasa'
    ]);

    // Intenta extraer un nombre nuevo de la frase original (respeta mayúsculas del dictado)
    function adivinarNombreNuevo(original, textoNorm, conceptos) {
        const palabrasConcepto = new Set();
        conceptos.forEach(c => normalizar(c.nombre).split(' ').forEach(p => palabrasConcepto.add(p)));
        const esCandidata = (p) => p && !p.startsWith('#') && !NO_NOMBRES.has(p) && !palabrasConcepto.has(p)
            && !palabrasConcepto.has(p.replace(/e?s$/, '')) && /^[a-z]{2,}$/.test(p);

        const patrones = [
            /\b(?:a|para|de|con) ([a-z]+)(?: ([a-z]+))?/g,
            /^([a-z]+)(?: ([a-z]+))? (?:me|le|ya|pago|abono|debe|devolvio|cancelo)\b/g
        ];

        // Palabras del texto original indexadas por su forma normalizada, para conservar tildes
        const originales = {};
        const capitalizadas = new Set();
        original.split(/\s+/).forEach(p => {
            const limpia = p.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
            if (!limpia) return;
            const n = normalizar(limpia);
            if (!originales[n]) originales[n] = limpia;
            // El dictado suele capitalizar los nombres propios
            if (/^[A-ZÁÉÍÓÚÑ]/.test(limpia)) capitalizadas.add(n);
        });
        const restaurar = (n) => {
            const o = originales[n] || n;
            return o.charAt(0).toUpperCase() + o.slice(1).toLowerCase();
        };

        for (const re of patrones) {
            let m;
            while ((m = re.exec(textoNorm))) {
                if (!esCandidata(m[1])) continue;
                let nombre = restaurar(m[1]);
                if (esCandidata(m[2]) && capitalizadas.has(m[2])) nombre += ' ' + restaurar(m[2]);
                return nombre;
            }
        }

        // Último recurso: primera palabra capitalizada que no sea la primera de la frase
        const palabrasOrig = original.split(/\s+/).slice(1);
        for (const p of palabrasOrig) {
            const n = normalizar(p).replace(/[^a-z]/g, '');
            if (/^[A-ZÁÉÍÓÚÑ]/.test(p) && esCandidata(n)) return restaurar(n);
        }
        return null;
    }

    // ========================
    // Interpretación principal
    // ========================
    // opciones: { nombres: string[], conceptos: [{id,nombre,tipo}], hoy?: Date }
    function interpretar(frase, opciones) {
        const nombres = opciones.nombres || [];
        const conceptos = opciones.conceptos || [];
        const hoy = opciones.hoy || new Date();

        const original = (frase || '').trim();
        let texto = normalizar(original);

        // Comentario explícito: "... nota: es del lunes" / "comentario ..."
        let comentario = '';
        const mComentario = original.match(/\b(nota|comentario|observaci[oó]n)\s*:?\s*(.+)$/i);
        if (mComentario) {
            comentario = mComentario[2].trim();
            texto = normalizar(original.slice(0, mComentario.index));
        }

        texto = convertirNumeros(texto);
        const resFecha = extraerFecha(texto, hoy);
        texto = resFecha.texto;

        // Interés: "al 5%", "al 5 por ciento mensual", "con intereses del 2,5%"
        let tasaMensual = null;
        const mTasa = texto.match(/#?(\d+(?:[.,]\d+)?) ?(?:%|por ciento|por #100)(?: (?:mensual|al mes|cada mes))?/);
        if (mTasa) {
            tasaMensual = parseFloat(mTasa[1].replace(',', '.'));
            texto = texto.replace(mTasa[0], ' ').replace(/\s+/g, ' ').trim();
        }

        // Valor: el número más grande que quede (los de fecha ya se quitaron)
        const numeros = (texto.match(/#\d+/g) || []).map(n => parseInt(n.slice(1), 10));
        const valor = numeros.length ? Math.max(...numeros) : null;

        const tipoDetectado = detectarTipo(texto);
        let concepto = buscarConcepto(texto, conceptos);

        // "Juan me pagó el almuerzo" => concepto de pago, y se anota de qué fue
        if (tipoDetectado && concepto && concepto.tipo !== tipoDetectado) {
            const alterno = conceptos.find(c => c.tipo === tipoDetectado && normalizar(c.nombre) === 'pago')
                || conceptos.find(c => c.tipo === tipoDetectado);
            if (alterno) {
                if (!comentario) comentario = `${tipoDetectado === 'pago' ? 'Pago de' : 'Por'} ${concepto.nombre.toLowerCase()}`;
                concepto = alterno;
            }
        }
        if (!concepto && tipoDetectado) {
            const delTipo = conceptos.filter(c => c.tipo === tipoDetectado);
            const generico = delTipo.find(c => ['pago', 'abono', 'prestamo'].includes(normalizar(c.nombre)));
            concepto = generico || (delTipo.length === 1 ? delTipo[0] : null);
        }

        // Con interés es un préstamo: preferir ese concepto si existe
        if (tasaMensual && (!concepto || concepto.tipo === 'gasto')) {
            const prestamo = conceptos.find(c => c.tipo === 'gasto' && normalizar(c.nombre).includes('prestamo'));
            if (prestamo && concepto !== prestamo) {
                if (concepto && !comentario) comentario = `Por ${concepto.nombre.toLowerCase()}`;
                concepto = prestamo;
            }
        }

        let nombre = buscarPersona(texto, nombres);
        let nombreNuevo = false;
        if (!nombre) {
            nombre = adivinarNombreNuevo(original, texto, conceptos);
            nombreNuevo = !!nombre;
        }

        const tipo = concepto ? concepto.tipo : tipoDetectado;
        const faltantes = [];
        if (!nombre) faltantes.push('persona');
        if (!valor) faltantes.push('valor');
        if (!concepto) faltantes.push('concepto');

        return {
            frase: original,
            nombre,
            nombreNuevo,
            valor,
            fecha: resFecha.fecha || aISO(hoy),
            fechaDicha: !!resFecha.fecha,
            conceptoId: concepto ? concepto.id : null,
            conceptoNombre: concepto ? concepto.nombre : null,
            tipo,
            comentario,
            tasaMensual,
            faltantes,
            completo: faltantes.length === 0
        };
    }

    // Puntaje para escoger la mejor alternativa del reconocimiento de voz
    function puntaje(r) {
        return (r.nombre ? (r.nombreNuevo ? 2 : 3) : 0) + (r.valor ? 3 : 0) + (r.conceptoId ? 2 : 0) + (r.fechaDicha ? 1 : 0);
    }

    function interpretarMejor(frases, opciones) {
        let mejor = null;
        frases.forEach(f => {
            const r = interpretar(f, opciones);
            if (!mejor || puntaje(r) > puntaje(mejor)) mejor = r;
        });
        return mejor;
    }

    const api = { interpretar, interpretarMejor, normalizar, convertirNumeros, aISO };
    global.VozParser = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
