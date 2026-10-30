// ========================
// Variables globales
// ========================
let transacciones = [];
let nombresUnicos = [];
let conceptos = [];
let dropdownAbierto = false;

// ========================
// Utilidades
// ========================
// Fecha local (toISOString usa UTC y en Colombia después de las 7 pm daba el día siguiente)
function hoyISO() {
    return VozParser.aISO(new Date());
}

function escapeHtml(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatearMoneda(valor) {
    return '$' + Math.round(valor).toLocaleString('es-CO');
}

const ICONOS = {
    gasto: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    pago: '<svg viewBox="0 0 24 24"><path d="M17 7 7 17M15 17H7V9"/></svg>',
    borrar: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    flecha: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-.8.8c-1-.4-1.6-1-2-2l.8-.8-1-2z"/></svg>'
};

function iniciales(nombre) {
    const partes = String(nombre).trim().split(/\s+/);
    return ((partes[0] || '')[0] + ((partes[1] || '')[0] || '')).toUpperCase();
}

function avatarHTML(nombre) {
    return `<span class="avatar">${escapeHtml(iniciales(nombre))}</span>`;
}

// Estado de los préstamos con interés, calculado a hoy
function estadoIntereses() {
    return Intereses.calcular(transacciones, hoyISO());
}

// Saldo por persona = gastos − pagos + intereses causados (redondeado a pesos)
function calcularBalances(intereses = estadoIntereses()) {
    const balances = {};
    transacciones.forEach(t => {
        balances[t.nombre] = (balances[t.nombre] || 0) + (t.tipo === 'pago' ? -t.valor : t.valor);
    });
    Object.keys(balances).forEach(n => {
        balances[n] = Math.round(balances[n] + (intereses.interesPorPersona[n] || 0));
    });
    return balances;
}

function esPrestamo(concepto) {
    return !!concepto && concepto.tipo === 'gasto' && VozParser.normalizar(concepto.nombre).includes('prestamo');
}

// Cabecera: total que te deben y barra repartida por persona
function actualizarResumen() {
    const deudores = Object.entries(calcularBalances())
        .filter(([, b]) => b > 0)
        .sort((a, b) => b[1] - a[1]);
    const total = deudores.reduce((s, [, b]) => s + b, 0);

    document.getElementById('resumenTotal').textContent = formatearMoneda(total);
    document.getElementById('resumenTotalSaldos').textContent = formatearMoneda(total);
    document.getElementById('resumenBarra').innerHTML = deudores
        .map(([n, b]) => `<span style="flex:${b}" title="${escapeHtml(n)}"></span>`)
        .join('');

    const leyenda = document.getElementById('resumenLeyenda');
    if (!deudores.length) {
        leyenda.textContent = 'Nadie te debe ahora mismo';
    } else {
        const top = deudores.slice(0, 3)
            .map(([n, b]) => `<span>${escapeHtml(n.split(' ')[0])} <b>${formatearMoneda(b)}</b></span>`);
        if (deudores.length > 3) top.push(`<span>+${deudores.length - 3} más</span>`);
        leyenda.innerHTML = top.join('');
    }
}

function toast(mensaje, tipo = 'ok', duracion = 3500) {
    const cont = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = 'toast ' + tipo;
    el.textContent = mensaje;
    cont.appendChild(el);
    setTimeout(() => {
        el.classList.add('saliendo');
        setTimeout(() => el.remove(), 300);
    }, duracion);
}

// ========================
// Almacenamiento
// ========================
function cargarDatos() {
    const datos = localStorage.getItem('controlAlmuerzos');
    if (datos) {
        transacciones = JSON.parse(datos);
        actualizarNombres();
    }

    const datosConceptos = localStorage.getItem('controlConceptos');
    if (datosConceptos) {
        conceptos = JSON.parse(datosConceptos);
    } else {
        // Conceptos por defecto
        conceptos = [
            { id: 1, nombre: 'Almuerzo', tipo: 'gasto' },
            { id: 2, nombre: 'Pago', tipo: 'pago' }
        ];
        guardarConceptos();
    }

    // Los intereses se ofrecen en el concepto Préstamo; se crea si no existe
    if (!conceptos.some(esPrestamo)) {
        conceptos.push({ id: Date.now(), nombre: 'Préstamo', tipo: 'gasto' });
        guardarConceptos();
    }
}

function guardarDatos() {
    localStorage.setItem('controlAlmuerzos', JSON.stringify(transacciones));
    actualizarResumen();
}

function guardarConceptos() {
    localStorage.setItem('controlConceptos', JSON.stringify(conceptos));
}

function actualizarNombres() {
    nombresUnicos = [...new Set(transacciones.map(t => t.nombre))].sort((a, b) => a.localeCompare(b, 'es'));
}

function formatearFecha(fechaISO) {
    const [año, mes, dia] = fechaISO.split('-');
    return `${dia}/${mes}/${año}`;
}

// ========================
// Tabs
// ========================
function cambiarTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'historial') cargarHistorial();
    else if (tabName === 'deudas') cargarDeudas();
    else if (tabName === 'ajustes') { cargarListaConceptos(); cargarAjustesListas(); }
    else if (tabName === 'gastos') cargarGastos();
    else if (tabName === 'pagos') cargarPagosMes();
}

// ========================
// Dropdown nombres
// ========================
function toggleDropdown() {
    if (dropdownAbierto) {
        cerrarDropdown();
    } else {
        const menu = document.getElementById('nombreDropdownMenu');
        const btn = document.getElementById('nombreDropdownBtn');
        cargarOpcionesDropdown();
        menu.classList.add('show');
        btn.classList.add('open');
        btn.querySelector('.dropdown-arrow').classList.add('rotated');
        dropdownAbierto = true;
    }
}

function cargarOpcionesDropdown() {
    const menu = document.getElementById('nombreDropdownMenu');
    let html = `
        <div class="new-name-section">
            <div class="new-name-title">Persona nueva</div>
            <div class="new-name-input-container">
                <input type="text" class="new-name-input" id="newNameInput" placeholder="Nombre">
                <button type="button" class="add-name-btn" onclick="agregarNombre()" aria-label="Agregar">✓</button>
            </div>
        </div>
    `;
    // data-nombre en vez de onclick inline: nombres con comillas (O'Neil) rompían el HTML
    nombresUnicos.forEach(nombre => {
        html += `<div class="name-option" data-nombre="${escapeHtml(nombre)}">${avatarHTML(nombre)}${escapeHtml(nombre)}</div>`;
    });
    menu.innerHTML = html;

    document.getElementById('newNameInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); agregarNombre(); }
    });
}

function agregarNombre() {
    const input = document.getElementById('newNameInput');
    const nombre = input.value.trim();
    if (nombre) seleccionarNombre(nombre);
    else toast('Por favor escriba un nombre', 'aviso');
}

function establecerNombre(nombre) {
    const btnText = document.querySelector('.dropdown-text');
    const hiddenInput = document.getElementById('nombreSelected');
    if (nombre) {
        btnText.textContent = nombre;
        btnText.classList.remove('placeholder');
    } else {
        btnText.textContent = 'Elige o agrega una persona';
        btnText.classList.add('placeholder');
    }
    hiddenInput.value = nombre || '';
}

function seleccionarNombre(nombre) {
    establecerNombre(nombre);
    cerrarDropdown();
    limpiarMarca(document.getElementById('nombreDropdownBtn'));
}

function cerrarDropdown() {
    const menu = document.getElementById('nombreDropdownMenu');
    const btn = document.getElementById('nombreDropdownBtn');
    menu.classList.remove('show');
    btn.classList.remove('open');
    btn.querySelector('.dropdown-arrow').classList.remove('rotated');
    dropdownAbierto = false;
}

// ========================
// Select de conceptos en registro
// ========================
function cargarConceptosSelect() {
    const sel = document.getElementById('conceptoSelect');
    const actual = sel.value;
    sel.innerHTML = '<option value="">Elegir</option>';
    conceptos.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${escapeHtml(c.nombre)} (${c.tipo === 'pago' ? 'pago' : 'gasto'})</option>`;
    });
    sel.value = actual;
}

function actualizarBadgeTipo() {
    const id = parseInt(document.getElementById('conceptoSelect').value);
    const badgeContainer = document.getElementById('tipoBadgeContainer');
    const badge = document.getElementById('tipoBadge');
    const c = id ? conceptos.find(x => x.id === id) : null;
    if (c) {
        badgeContainer.style.display = 'block';
        badge.className = 'badge ' + (c.tipo === 'pago' ? 'badge-pago' : 'badge-gasto');
        badge.textContent = c.tipo === 'pago' ? 'Pago: resta de lo que te debe' : 'Gasto: suma a lo que te debe';
    } else {
        badgeContainer.style.display = 'none';
    }
    const etiqueta = c ? (c.tipo === 'pago' ? 'Entra a' : 'Sale de') : 'Cuenta';
    document.getElementById('cuentaRegistroLabel').innerHTML = `${etiqueta} <span class="opcional">opcional</span>`;
    actualizarCajaInteres();
}

// ========================
// Intereses en el formulario (solo préstamos)
// ========================
function actualizarCajaInteres() {
    const id = parseInt(document.getElementById('conceptoSelect').value);
    const concepto = conceptos.find(x => x.id === id);
    const caja = document.getElementById('interesBox');
    const activo = document.getElementById('interesActivo');

    caja.hidden = !esPrestamo(concepto);
    document.getElementById('interesCampos').hidden = caja.hidden || !activo.checked;

    const valor = parseFloat(document.getElementById('valor').value) || 0;
    const tasa = parseFloat(document.getElementById('interesTasa').value) || 0;
    document.getElementById('interesAyuda').textContent = valor && tasa
        ? `${formatearMoneda(valor * tasa / 100)} al mes · ${formatearMoneda(valor * tasa / 100 / 30)} por día`
        : 'Se calcula por días sobre el capital pendiente. Los abonos pagan primero intereses.';
}

function reiniciarCajaInteres() {
    document.getElementById('interesActivo').checked = false;
    document.getElementById('interesTasa').value = '';
    actualizarCajaInteres();
}

function tasaDelFormulario() {
    if (document.getElementById('interesBox').hidden || !document.getElementById('interesActivo').checked) return null;
    const tasa = parseFloat(document.getElementById('interesTasa').value);
    return tasa > 0 ? tasa : null;
}

// ========================
// Procesar formulario
// ========================
function procesarFormulario(event) {
    event.preventDefault();

    const nombre = document.getElementById('nombreSelected').value;
    const valor = parseFloat(document.getElementById('valor').value);
    const fecha = document.getElementById('fecha').value;
    const conceptoId = parseInt(document.getElementById('conceptoSelect').value);
    const comentario = document.getElementById('comentario').value.trim();

    if (!nombre || !valor || !fecha || !conceptoId) {
        toast('Por favor complete todos los campos', 'aviso');
        return;
    }

    if (valor <= 0) {
        toast('El valor debe ser mayor a 0', 'aviso');
        return;
    }

    const concepto = conceptos.find(c => c.id === conceptoId);
    if (!concepto) { toast('Concepto no válido', 'error'); return; }

    const tasaMensual = tasaDelFormulario();
    if (document.getElementById('interesActivo').checked && esPrestamo(concepto) && !tasaMensual) {
        toast('Escribe el % de interés mensual, o desmarca "Cobrar intereses".', 'aviso');
        return;
    }

    const nuevaTransaccion = {
        id: Date.now(),
        nombre: nombre,
        valor: valor,
        fecha: formatearFecha(fecha),
        fechaOriginal: fecha,
        conceptoId: concepto.id,
        conceptoNombre: concepto.nombre,
        tipo: concepto.tipo,
        comentario: comentario,
        timestamp: new Date().toISOString()
    };
    if (tasaMensual) nuevaTransaccion.tasaMensual = tasaMensual;
    const cuentaId = valorChips('cuentaRegistro');
    if (cuentaId) nuevaTransaccion.cuentaId = cuentaId;

    transacciones.push(nuevaTransaccion);
    guardarDatos();
    actualizarNombres();

    reiniciarCajaInteres();
    renderChips('cuentaRegistro', 'cuenta', null);
    establecerNombre('');
    document.getElementById('valor').value = '';
    document.getElementById('conceptoSelect').value = '';
    document.getElementById('comentario').value = '';
    document.getElementById('fecha').value = hoyISO();
    document.getElementById('tipoBadgeContainer').style.display = 'none';
    document.getElementById('fraseRapida').value = '';
    ajustarAlturaFrase(document.getElementById('fraseRapida'));
    document.getElementById('estadoVoz').textContent = '';
    limpiarMarcas();

    contarEvento(concepto.tipo === 'pago' ? 'registro-abono' : 'registro-prestamo');
    const tipoLabel = concepto.tipo === 'pago' ? 'Pago' : 'Gasto';
    const interesLabel = tasaMensual ? ` al ${tasaMensual}% mensual` : '';
    toast(`${tipoLabel} registrado\n${nombre}: ${formatearMoneda(valor)}${interesLabel}\nConcepto: ${concepto.nombre}`);
}

// ========================
// Historial con filtros
// ========================
function cargarHistorial(filtradas) {
    const container = document.getElementById('historialContent');
    let datos = filtradas !== undefined ? filtradas : transacciones;

    // Cargar filtros de personas y conceptos
    const filtroPersona = document.getElementById('filtroPersona');
    const filtroConcepto = document.getElementById('filtroConcepto');
    const personaActual = filtroPersona.value;
    const conceptoActual = filtroConcepto.value;

    filtroPersona.innerHTML = '<option value="">Todas las personas</option>';
    nombresUnicos.forEach(n => {
        filtroPersona.innerHTML += `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`;
    });
    filtroPersona.value = personaActual;

    filtroConcepto.innerHTML = '<option value="">Todos los conceptos</option>';
    conceptos.forEach(c => {
        filtroConcepto.innerHTML += `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`;
    });
    filtroConcepto.value = conceptoActual;

    if (datos.length === 0) {
        container.innerHTML = transacciones.length
            ? '<div class="no-data"><strong>Sin resultados</strong>Ningún registro coincide con los filtros.</div>'
            : '<div class="no-data"><strong>Todavía no hay registros</strong>Dicta el primero en la barra de abajo.</div>';
        return;
    }

    const ordenadas = [...datos].sort((a, b) =>
        (b.fechaOriginal || '').localeCompare(a.fechaOriginal || '') || b.id - a.id);

    let html = '';
    let fechaActual = null;
    const intereses = estadoIntereses();
    ordenadas.forEach(t => {
        if (t.fechaOriginal !== fechaActual) {
            fechaActual = t.fechaOriginal;
            html += `<div class="grupo-fecha">${escapeHtml(etiquetaFecha(t.fechaOriginal, t.fecha))}</div>`;
        }
        const tipo = t.tipo === 'pago' ? 'pago' : 'gasto';
        const comentarioHTML = t.comentario ? `<div class="record-comment">${escapeHtml(t.comentario)}</div>` : '';
        // Solo gastos con saldo pendiente pueden recibir pago individual
        const btnPagar = tipo === 'gasto' && calcularSaldoItem(t.id, intereses) > 0
            ? `<button class="btn-pagar-item" onclick="abrirModalPago(${t.id})">Registrar pago</button>`
            : '';
        const p = intereses.prestamos[t.id];
        const interesHTML = p ? `
            <div class="record-interes">
                <span class="badge badge-interes">${p.tasa}% mensual</span>
                ${p.interesDesde > p.fecha ? `Interés desde ${escapeHtml(etiquetaFecha(p.interesDesde).toLowerCase())} · ` : ''}
                ${p.capital > 0
                    ? `Capital ${formatearMoneda(p.capital)} · intereses por pagar ${formatearMoneda(p.interesPendiente)}`
                    : `Pagado · intereses cobrados ${formatearMoneda(p.interesPagado)}`}
            </div>` : '';
        html += `
            <div class="record ${tipo}">
                <div class="record-icono">${ICONOS[tipo]}</div>
                <div class="record-cuerpo">
                    <div class="record-header">
                        <div class="record-name">${escapeHtml(t.nombre)}</div>
                        <div class="record-amount">${tipo === 'pago' ? '−' : '+'}${formatearMoneda(t.valor)}</div>
                    </div>
                    <div class="record-details">${escapeHtml(t.conceptoNombre || t.concepto || 'Sin concepto')} · ${tipo === 'pago' ? 'abono' : 'te debe'}${t.cuentaId ? ' · ' + escapeHtml(nombreCuenta(t.cuentaId)) : ''}</div>
                    ${interesHTML}
                    ${comentarioHTML}
                    <div class="record-actions">
                        ${btnPagar}
                        <button class="btn-delete" onclick="eliminarRegistro(${t.id})" aria-label="Eliminar registro">${ICONOS.borrar}</button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaFecha(iso, respaldo) {
    if (!iso) return respaldo || 'Sin fecha';
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    if (iso === hoyISO()) return 'Hoy';
    if (iso === VozParser.aISO(ayer)) return 'Ayer';
    const [a, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES_CORTOS[m - 1]}${a !== new Date().getFullYear() ? ' ' + a : ''}`;
}

function aplicarFiltros() {
    const persona = document.getElementById('filtroPersona').value;
    const conceptoId = parseInt(document.getElementById('filtroConcepto').value);
    const tipo = document.getElementById('filtroTipo').value;
    const mes = document.getElementById('filtroMes').value;

    let filtradas = [...transacciones];
    if (persona) filtradas = filtradas.filter(t => t.nombre === persona);
    if (conceptoId) filtradas = filtradas.filter(t => t.conceptoId === conceptoId);
    if (tipo) filtradas = filtradas.filter(t => t.tipo === tipo);
    if (mes) filtradas = filtradas.filter(t => t.fechaOriginal && t.fechaOriginal.startsWith(mes));

    cargarHistorial(filtradas);
}

function limpiarFiltros() {
    document.getElementById('filtroPersona').value = '';
    document.getElementById('filtroConcepto').value = '';
    document.getElementById('filtroTipo').value = '';
    document.getElementById('filtroMes').value = '';
    cargarHistorial();
}

// ========================
// Eliminar registro
// ========================
function eliminarRegistro(id) {
    const t = transacciones.find(x => x.id === id);
    if (!t) return;
    const msg = `¿Eliminar este registro?\n\n${t.nombre}\n${formatearMoneda(t.valor)}\n${t.conceptoNombre || t.concepto} - ${t.fecha}`;
    if (confirm(msg)) {
        transacciones = transacciones.filter(x => x.id !== id);
        guardarDatos();
        actualizarNombres();
        cargarHistorial();
        toast('Registro eliminado');
    }
}

// ========================
// Balances / Deudas
// ========================
function cargarDeudas() {
    const container = document.getElementById('deudasContent');

    // Calcular balance por persona (incluye intereses causados)
    const intereses = estadoIntereses();
    const balances = calcularBalances(intereses);
    const detallePorPersona = {};
    transacciones.forEach(t => {
        (detallePorPersona[t.nombre] = detallePorPersona[t.nombre] || []).push(t);
    });

    if (Object.keys(balances).length === 0) {
        container.innerHTML = '<div class="no-data"><strong>Sin saldos todavía</strong>Aquí verás cuánto te debe cada persona.</div>';
        return;
    }

    let html = '';

    // Ordenar: primero con deuda (positivo), luego al día, luego crédito
    const personas = Object.entries(balances).sort((a, b) => b[1] - a[1]);
    personasSaldos = personas.map(([nombre]) => nombre);

    personas.forEach(([nombre, balance], idx) => {
        const balanceClass = balance > 0 ? 'balance-positivo' : (balance < 0 ? 'balance-negativo' : 'balance-cero');
        const balanceLabel = balance > 0
            ? `<small>te debe</small>${formatearMoneda(balance)}`
            : (balance < 0 ? `<small>a su favor</small>${formatearMoneda(Math.abs(balance))}` : '<small>saldo</small>Al día');
        const id = 'p' + idx;

        // Detalle por concepto
        const det = detallePorPersona[nombre];
        const resumenConceptos = {};
        det.forEach(t => {
            const key = t.conceptoNombre || t.concepto || 'Sin concepto';
            if (!resumenConceptos[key]) resumenConceptos[key] = { tipo: t.tipo, total: 0, count: 0 };
            resumenConceptos[key].total += t.valor;
            resumenConceptos[key].count++;
        });

        // Lo que debe hoy, después de cruzar todos los abonos
        let pendienteHTML = '';
        const pendientesSinInteres = {};
        det.filter(t => t.tipo !== 'pago').sort((a, b) => (a.fechaOriginal || '').localeCompare(b.fechaOriginal || '')).forEach(t => {
            const d = intereses.deudas[t.id];
            if (!d || d.capital + d.interesPendiente < 1) return;
            const concepto = t.conceptoNombre || t.concepto || 'Sin concepto';
            if (d.tasa > 0) {
                pendienteHTML += `
                    <div class="pendiente-prestamo">
                        <div class="detalle-row">
                            <span>${escapeHtml(concepto)} · ${escapeHtml(etiquetaFecha(t.fechaOriginal, t.fecha))} <span class="badge badge-interes">${d.tasa}%</span></span>
                            <span class="balance-positivo">${formatearMoneda(d.capital + d.interesPendiente)}</span>
                        </div>
                        <div class="pendiente-desglose">Capital ${formatearMoneda(d.capital)} de ${formatearMoneda(d.capitalInicial)} · intereses ${formatearMoneda(d.interesPendiente)}</div>
                    </div>
                `;
            } else {
                const g = pendientesSinInteres[concepto] = pendientesSinInteres[concepto] || { count: 0, total: 0 };
                g.count++;
                g.total += d.capital;
            }
        });
        Object.entries(pendientesSinInteres).forEach(([concepto, g]) => {
            pendienteHTML += `
                <div class="detalle-row">
                    <span>${escapeHtml(concepto)} · ${g.count} pendiente${g.count === 1 ? '' : 's'}</span>
                    <span class="balance-positivo">${formatearMoneda(g.total)}</span>
                </div>
            `;
        });
        const credito = intereses.creditoPorPersona[nombre] || 0;
        if (credito >= 1) {
            pendienteHTML += `
                <div class="detalle-row">
                    <span>Saldo a su favor</span>
                    <span class="balance-negativo">−${formatearMoneda(credito)}</span>
                </div>
            `;
        }

        let historicoHTML = '';
        Object.entries(resumenConceptos).forEach(([cNombre, cData]) => {
            historicoHTML += `
                <div class="detalle-row">
                    <span>${escapeHtml(cNombre)} · ${cData.count}</span>
                    <span>${cData.tipo === 'pago' ? '−' : '+'}${formatearMoneda(cData.total)}</span>
                </div>
            `;
        });
        const interesPersona = intereses.interesPorPersona[nombre] || 0;
        if (interesPersona >= 1) {
            historicoHTML += `
                <div class="detalle-row">
                    <span>Intereses causados</span>
                    <span>+${formatearMoneda(interesPersona)}</span>
                </div>
            `;
        }

        const detalleHTML = `
            ${pendienteHTML ? `<div class="detalle-titulo">Pendiente hoy</div>${pendienteHTML}` : ''}
            <div class="detalle-titulo">Histórico</div>
            <div class="detalle-historico">${historicoHTML}</div>
        `;

        const ultima = det.reduce((m, t) => (t.fechaOriginal || '') > m ? t.fechaOriginal : m, '');
        html += `
            <div class="persona-card">
                <div class="persona-header" onclick="toggleDetalle('${id}')">
                    ${avatarHTML(nombre)}
                    <div class="persona-info">
                        <div class="persona-nombre">${escapeHtml(nombre)}</div>
                        <div class="persona-meta">${det.length} registro${det.length === 1 ? '' : 's'} · último: ${escapeHtml(etiquetaFecha(ultima).toLowerCase())}</div>
                    </div>
                    <span class="persona-balance ${balanceClass}">${balanceLabel}</span>
                    <span class="toggle-arrow" id="arrow_${id}">${ICONOS.flecha}</span>
                </div>
                <div class="persona-detalle" id="detalle_${id}">
                    ${detalleHTML}
                    <div class="persona-acciones">
                        ${balance > 0 ? `<button type="button" class="btn-abono" onclick="abrirAbonoPersona(${idx})">Registrar abono</button>` : ''}
                        <button type="button" class="btn-whatsapp" onclick="copiarResumenDeuda(${idx})">
                            ${ICONOS.whatsapp}Copiar resumen
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function toggleDetalle(id) {
    const detalle = document.getElementById('detalle_' + id);
    const arrow = document.getElementById('arrow_' + id);
    detalle.classList.toggle('open');
    arrow.classList.toggle('open');
}

// ========================
// Resumen de deuda para pegar en WhatsApp
// ========================
let personasSaldos = [];

function fechaCorta(t) {
    if (!t.fechaOriginal) return t.fecha || '';
    const [, m, d] = t.fechaOriginal.split('-');
    return `${d}/${m}`;
}

function textoResumenDeuda(nombre) {
    const movimientos = transacciones
        .filter(t => t.nombre === nombre)
        .sort((a, b) => (a.fechaOriginal || '').localeCompare(b.fechaOriginal || '') || a.id - b.id);

    // Solo lo ocurrido desde la última vez que la persona quedó al día
    let acumulado = 0;
    let desde = 0;
    movimientos.forEach((t, i) => {
        acumulado += t.tipo === 'pago' ? -t.valor : t.valor;
        if (acumulado <= 0) desde = i + 1;
    });
    const vigentes = movimientos.slice(desde);
    const saldo = calcularBalances()[nombre] || 0;
    // Lo que el listado no explica son los intereses causados
    const netoVigentes = vigentes.reduce((s, t) => s + (t.tipo === 'pago' ? -t.valor : t.valor), 0);
    const interesLinea = Math.round(saldo - netoVigentes);
    const tasas = [...new Set(vigentes.filter(t => t.tasaMensual).map(t => t.tasaMensual + '%'))];
    const primerNombre = nombre.trim().split(/\s+/)[0];

    if (saldo <= 0) {
        return saldo < 0
            ? `Hola ${primerNombre}, tienes un saldo a favor de *${formatearMoneda(-saldo)}*.`
            : `Hola ${primerNombre}, estás al día, no tienes saldo pendiente. ¡Gracias!`;
    }

    const lineas = vigentes.map(t => {
        const signo = t.tipo === 'pago' ? '−' : '+';
        const concepto = t.conceptoNombre || t.concepto || 'Sin concepto';
        const tasa = t.tasaMensual ? ` al ${t.tasaMensual}% mensual` : '';
        const nota = t.comentario ? ` (${t.comentario})` : '';
        return `${fechaCorta(t)}  ${signo}${formatearMoneda(t.valor)}  ${concepto}${tasa}${nota}`;
    });
    if (interesLinea >= 1) {
        const hoy = hoyISO().split('-');
        const detalleTasa = tasas.length ? ` (${tasas.join(', ')} mensual)` : '';
        lineas.push(`${hoy[2]}/${hoy[1]}  +${formatearMoneda(interesLinea)}  Intereses causados${detalleTasa}`);
    }

    return [
        `Hola ${primerNombre}, este es el detalle de lo pendiente:`,
        '',
        ...lineas,
        '',
        `*Saldo pendiente: ${formatearMoneda(saldo)}*`
    ].join('\n');
}

async function copiarAlPortapapeles(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch (err) {
        // Respaldo para navegadores sin API de portapapeles
        const area = document.createElement('textarea');
        area.value = texto;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    }
}

async function copiarResumenDeuda(idx) {
    const nombre = personasSaldos[idx];
    if (!nombre) return;
    const ok = await copiarAlPortapapeles(textoResumenDeuda(nombre));
    if (ok) toast(`Resumen copiado.\nPégalo en el chat de ${nombre.split(' ')[0]} en WhatsApp.`);
    else toast('No se pudo copiar el resumen.', 'error');
}

// ========================
// Gestión de conceptos
// ========================
let tipoSeleccionado = '';

function seleccionarTipo(tipo) {
    tipoSeleccionado = tipo;
    document.getElementById('nuevoConceptoTipo').value = tipo;
    document.getElementById('btnGasto').className = 'tipo-btn' + (tipo === 'gasto' ? ' selected-gasto' : '');
    document.getElementById('btnPago').className = 'tipo-btn' + (tipo === 'pago' ? ' selected-pago' : '');
}

function agregarConcepto() {
    const nombre = document.getElementById('nuevoConceptoNombre').value.trim();
    const tipo = document.getElementById('nuevoConceptoTipo').value;

    if (!nombre) { toast('Ingrese un nombre para el concepto', 'aviso'); return; }
    if (!tipo) { toast('Seleccione el tipo: Gasto o Pago', 'aviso'); return; }

    if (conceptos.find(c => c.nombre.toLowerCase() === nombre.toLowerCase())) {
        toast('Ya existe un concepto con ese nombre', 'aviso');
        return;
    }

    conceptos.push({ id: Date.now(), nombre: nombre, tipo: tipo });
    guardarConceptos();

    document.getElementById('nuevoConceptoNombre').value = '';
    tipoSeleccionado = '';
    document.getElementById('btnGasto').className = 'tipo-btn';
    document.getElementById('btnPago').className = 'tipo-btn';
    document.getElementById('nuevoConceptoTipo').value = '';

    cargarListaConceptos();
    cargarConceptosSelect();
    toast(`Concepto "${nombre}" guardado`);
}

function eliminarConcepto(id) {
    const c = conceptos.find(x => x.id === id);
    if (!c) return;

    const enUso = transacciones.some(t => t.conceptoId === id);
    if (enUso) {
        toast(`No se puede eliminar "${c.nombre}" porque tiene registros asociados.`, 'aviso');
        return;
    }

    if (confirm(`¿Eliminar el concepto "${c.nombre}"?`)) {
        conceptos = conceptos.filter(x => x.id !== id);
        guardarConceptos();
        cargarListaConceptos();
        cargarConceptosSelect();
    }
}

function cargarListaConceptos() {
    const container = document.getElementById('listaConceptos');
    if (conceptos.length === 0) {
        container.innerHTML = '<div class="no-data"><strong>Sin conceptos</strong>Crea uno arriba para clasificar tus registros.</div>';
        return;
    }

    let html = '<div class="lista-titulo">Tus conceptos</div>';
    conceptos.forEach(c => {
        const badgeClass = c.tipo === 'pago' ? 'badge-pago' : 'badge-gasto';
        const usos = transacciones.filter(t => t.conceptoId === c.id).length;
        html += `
            <div class="concepto-item">
                <div>
                    <div class="concepto-nombre">${escapeHtml(c.nombre)}</div>
                    <div class="concepto-tipo">
                        <span class="badge ${badgeClass}">${c.tipo === 'pago' ? 'Pago' : 'Gasto'}</span>
                        ${usos ? ` ${usos} registro${usos === 1 ? '' : 's'}` : ''}
                    </div>
                </div>
                ${usos ? '' : `<button class="btn-delete" onclick="eliminarConcepto(${c.id})" aria-label="Eliminar concepto">${ICONOS.borrar}</button>`}
            </div>
        `;
    });

    container.innerHTML = html;
}

// ========================
// Exportar / Importar JSON
// ========================
function exportarJSON() {
    const datos = {
        version: 1,
        fechaExportacion: new Date().toISOString(),
        transacciones: transacciones,
        conceptos: conceptos,
        compromisos: compromisos,
        pagosMes: pagosMes,
        cuentas: cuentas,
        categorias: categoriasGasto,
        gastos: gastos
    };
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `respaldo_financiero_${hoyISO()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Copia de seguridad descargada');
}

function importarJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const datos = JSON.parse(e.target.result);

            // Archivo solo con compromisos: se agregan sin tocar el resto
            if (!datos.transacciones && Array.isArray(datos.compromisos)) {
                const nuevos = datos.compromisos.filter(c =>
                    !compromisos.some(x => x.nombre.toLowerCase() === c.nombre.toLowerCase()));
                event.target.value = '';
                if (!nuevos.length) { toast('Esos compromisos ya estaban creados.', 'aviso'); return; }
                if (!confirm(`¿Agregar ${nuevos.length} compromiso(s) a Pagos del mes?\n\n${nuevos.map(c => '• ' + c.nombre).join('\n')}`)) return;
                compromisos.push(...nuevos);
                guardarCompromisos();
                cargarPagosMes();
                toast(`${nuevos.length} compromisos agregados.`);
                return;
            }

            if (!datos.transacciones || !datos.conceptos) {
                toast('El archivo no tiene el formato correcto.', 'error');
                return;
            }

            const conPagos = Array.isArray(datos.compromisos);
            const lineaPagos = conPagos ? `\nCompromisos: ${datos.compromisos.length}` : '';
            if (!confirm(`¿Restaurar datos del respaldo?\n\nFecha del respaldo: ${datos.fechaExportacion ? datos.fechaExportacion.split('T')[0] : 'desconocida'}\nRegistros: ${datos.transacciones.length}\nConceptos: ${datos.conceptos.length}${lineaPagos}\n\nEsto reemplazará todos los datos actuales.`)) {
                event.target.value = '';
                return;
            }

            transacciones = datos.transacciones;
            conceptos = datos.conceptos;
            guardarDatos();
            guardarConceptos();
            // Respaldos anteriores no traen pagos del mes: se conservan los actuales
            if (conPagos) {
                compromisos = datos.compromisos;
                pagosMes = datos.pagosMes || [];
                guardarCompromisos();
                guardarPagosMes();
            }
            if (Array.isArray(datos.cuentas)) { cuentas = datos.cuentas; guardarCuentas(); }
            if (Array.isArray(datos.categorias)) { categoriasGasto = datos.categorias; guardarCategorias(); }
            if (Array.isArray(datos.gastos)) { gastos = datos.gastos; guardarGastos(); }
            actualizarNombres();
            cargarConceptosSelect();
            cargarHistorial();
            cargarPagosMes();

            event.target.value = '';
            toast('Datos restaurados correctamente.');
        } catch (err) {
            toast('Error al leer el archivo. Asegúrate de que sea un respaldo válido.', 'error');
        }
    };
    reader.readAsText(file);
}

// ========================
// Pagos: a un registro específico o abono general a la persona
// ========================
let pagoItemId = null;
let pagoPersona = null;

// Pendiente de un registro tras cruzar todos los abonos (incluye intereses si es préstamo)
function calcularSaldoItem(id, intereses = estadoIntereses()) {
    const d = intereses.deudas[id];
    return d ? Math.round(d.capital + d.interesPendiente) : 0;
}

function actualizarAvisoPago(saldo, permiteExceso) {
    const v = parseFloat(document.getElementById('modalValorPago').value) || 0;
    const restante = saldo - v;
    const aviso = document.getElementById('modalSaldoRestante');
    if (v > saldo && !permiteExceso) {
        aviso.textContent = 'El valor supera el saldo pendiente';
        aviso.style.color = 'var(--debe)';
    } else if (v > saldo) {
        aviso.textContent = `Queda ${formatearMoneda(v - saldo)} a su favor`;
        aviso.style.color = 'var(--abono)';
    } else if (restante > 0) {
        aviso.textContent = `Saldo restante tras abono: ${formatearMoneda(restante)}`;
        aviso.style.color = 'var(--tinta-suave)';
    } else {
        aviso.textContent = 'Queda pagado por completo';
        aviso.style.color = 'var(--abono)';
    }
}

function mostrarModalPago(titulo, infoHTML, saldo, permiteExceso) {
    document.querySelector('#modalPago .modal-title').textContent = titulo;
    document.getElementById('modalPagoInfo').innerHTML = infoHTML;
    const campoValor = document.getElementById('modalValorPago');
    campoValor.value = saldo;
    if (permiteExceso) campoValor.removeAttribute('max');
    else campoValor.max = saldo;
    campoValor.oninput = () => actualizarAvisoPago(saldo, permiteExceso);
    document.getElementById('modalFechaPago').value = hoyISO();
    document.getElementById('modalComentarioPago').value = '';
    document.getElementById('modalSaldoRestante').textContent = '';
    renderChips('cuentaAbono', 'cuenta', null);
    document.getElementById('modalPago').classList.add('show');
}

function abrirModalPago(id) {
    const t = transacciones.find(x => x.id === id);
    if (!t) return;

    const intereses = estadoIntereses();
    const saldo = calcularSaldoItem(id, intereses);
    if (saldo <= 0) {
        toast('Este registro ya está pagado completamente.');
        return;
    }
    pagoItemId = id;
    pagoPersona = null;

    const p = intereses.prestamos[id];
    const desgloseInteres = p ? `
        <span>Capital pendiente: ${formatearMoneda(p.capital)}</span>
        <span>Intereses por pagar (${p.tasa}% mensual): ${formatearMoneda(p.interesPendiente)}</span>
        <span>El abono cubre primero los intereses.</span>` : '';
    mostrarModalPago('Registrar pago', `
        <span><strong>${escapeHtml(t.nombre)}</strong> · ${escapeHtml(t.conceptoNombre || t.concepto)}</span>
        <span>Valor original: ${formatearMoneda(t.valor)}</span>
        ${desgloseInteres}
        <span>Saldo pendiente: <strong class="balance-positivo">${formatearMoneda(saldo)}</strong></span>
        ${t.comentario ? `<span>${escapeHtml(t.comentario)}</span>` : ''}
    `, saldo, false);
}

function abrirAbonoPersona(idx) {
    const nombre = personasSaldos[idx];
    if (!nombre) return;
    const saldo = calcularBalances()[nombre] || 0;
    if (saldo <= 0) {
        toast(`${nombre} no tiene saldo pendiente.`);
        return;
    }
    pagoItemId = null;
    pagoPersona = nombre;

    mostrarModalPago('Registrar abono', `
        <span><strong>${escapeHtml(nombre)}</strong></span>
        <span>Saldo pendiente: <strong class="balance-positivo">${formatearMoneda(saldo)}</strong></span>
        <span>Se aplica primero a intereses, luego a los préstamos del más antiguo al más nuevo y al final a las demás deudas.</span>
    `, saldo, true);
}

function cerrarModalPago() {
    document.getElementById('modalPago').classList.remove('show');
    pagoItemId = null;
    pagoPersona = null;
}

function confirmarPagoItem() {
    const t = pagoItemId ? transacciones.find(x => x.id === pagoItemId) : null;
    const nombre = t ? t.nombre : pagoPersona;
    if (!nombre) return;

    const valor = parseFloat(document.getElementById('modalValorPago').value);
    const fechaRaw = document.getElementById('modalFechaPago').value;
    const comentario = document.getElementById('modalComentarioPago').value.trim();

    if (!valor || valor <= 0) { toast('Ingrese un valor válido', 'aviso'); return; }
    if (!fechaRaw) { toast('Seleccione una fecha', 'aviso'); return; }

    const saldo = t ? calcularSaldoItem(pagoItemId) : (calcularBalances()[nombre] || 0);
    if (t && valor > saldo) { toast(`El valor (${formatearMoneda(valor)}) supera el saldo pendiente (${formatearMoneda(saldo)})`, 'aviso'); return; }

    // Buscar concepto de pago disponible (primero tipo pago, o crear uno genérico)
    let conceptoPago = conceptos.find(c => c.tipo === 'pago');
    if (!conceptoPago) {
        conceptoPago = { id: Date.now(), nombre: 'Pago', tipo: 'pago' };
        conceptos.push(conceptoPago);
        guardarConceptos();
    }

    const nuevoPago = {
        id: Date.now(),
        nombre: nombre,
        valor: valor,
        fecha: formatearFecha(fechaRaw),
        fechaOriginal: fechaRaw,
        conceptoId: conceptoPago.id,
        conceptoNombre: conceptoPago.nombre,
        tipo: 'pago',
        comentario: comentario || (t ? `Pago de: ${t.conceptoNombre || t.concepto} (${formatearMoneda(t.valor)})` : 'Abono'),
        timestamp: new Date().toISOString()
    };
    if (t) nuevoPago.pagoDeItemId = pagoItemId;
    const cuentaAbono = valorChips('cuentaAbono');
    if (cuentaAbono) nuevoPago.cuentaId = cuentaAbono;

    transacciones.push(nuevoPago);
    guardarDatos();
    actualizarNombres();
    contarEvento('registro-abono');

    const restante = saldo - valor;
    cerrarModalPago();
    cargarHistorial();
    if (document.getElementById('deudas').classList.contains('active')) cargarDeudas();

    if (restante < 0) {
        toast(`Abono registrado\n${nombre}: ${formatearMoneda(valor)}\nQueda ${formatearMoneda(-restante)} a su favor.`);
    } else if (restante === 0) {
        toast(`Pago registrado\n${nombre}: ${formatearMoneda(valor)}\n${t ? 'Registro pagado completamente.' : 'Queda al día.'}`);
    } else {
        toast(`Abono registrado\n${nombre}: ${formatearMoneda(valor)}\nSaldo restante: ${formatearMoneda(restante)}`);
    }
}

// ========================
// Registro rápido por voz
// ========================
let reconocimiento = null;
let escuchando = false;
let ultimaInterpretacion = null;

function marcar(el, ok) {
    el.classList.remove('campo-auto', 'campo-falta');
    el.classList.add(ok ? 'campo-auto' : 'campo-falta');
}

function limpiarMarca(el) {
    el.classList.remove('campo-auto', 'campo-falta');
}

function limpiarMarcas() {
    document.querySelectorAll('.campo-auto, .campo-falta').forEach(limpiarMarca);
}

function estadoVoz(texto) {
    document.getElementById('estadoVoz').textContent = texto;
}

function iniciarDictado() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        toast('Este navegador no permite dictado. Usa Chrome en Android, o el micrófono del teclado sobre el cuadro de texto.', 'aviso', 5000);
        document.getElementById('fraseRapida').focus();
        return;
    }
    if (escuchando) { reconocimiento.stop(); return; }

    const campo = document.getElementById('fraseRapida');
    const btn = document.getElementById('btnMic');
    let alternativas = [];

    reconocimiento = new SR();
    reconocimiento.lang = 'es-CO';
    reconocimiento.interimResults = true;
    reconocimiento.maxAlternatives = 3;
    reconocimiento.continuous = false;

    reconocimiento.onstart = () => {
        escuchando = true;
        btn.classList.add('escuchando');
        document.getElementById('dock').classList.add('escuchando');
        btn.setAttribute('aria-label', 'Detener dictado');
        campo.value = '';
        estadoVoz('Escuchando… toca de nuevo para terminar');
        contarEvento('dictado');
    };

    reconocimiento.onresult = (e) => {
        let texto = '';
        for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript;
        campo.value = texto.trim();
        ajustarAlturaFrase(campo);

        const ultimo = e.results[e.results.length - 1];
        if (ultimo.isFinal) {
            // Con un solo resultado se aprovechan las alternativas del reconocedor
            alternativas = e.results.length === 1
                ? Array.from(ultimo).map(a => a.transcript.trim())
                : [texto.trim()];
        }
    };

    reconocimiento.onerror = (e) => {
        const mensajes = {
            'not-allowed': 'Permiso de micrófono denegado. Actívalo en la configuración del sitio.',
            'service-not-allowed': 'Permiso de micrófono denegado. Actívalo en la configuración del sitio.',
            'no-speech': 'No se escuchó nada. Intenta de nuevo.',
            'network': 'El dictado necesita internet. Escribe la frase o intenta luego.',
            'audio-capture': 'No se encontró micrófono.'
        };
        if (e.error !== 'aborted') toast(mensajes[e.error] || 'Error de dictado: ' + e.error, 'aviso', 4500);
    };

    reconocimiento.onend = () => {
        escuchando = false;
        btn.classList.remove('escuchando');
        document.getElementById('dock').classList.remove('escuchando');
        btn.setAttribute('aria-label', 'Dictar por voz');
        if (alternativas.length) {
            interpretarFrase(alternativas);
        } else if (campo.value.trim()) {
            interpretarFrase([campo.value.trim()]);
        } else {
            estadoVoz('');
        }
    };

    try {
        reconocimiento.start();
    } catch (err) {
        toast('No se pudo iniciar el micrófono.', 'error');
    }
}

function ajustarAlturaFrase(campo) {
    campo.style.height = '44px';
    campo.style.height = Math.min(campo.scrollHeight, 110) + 'px';
}

function interpretarFrase(frases) {
    frases = frases.filter(f => f && f.trim());
    if (!frases.length) { toast('Escribe o dicta una frase primero', 'aviso'); return; }

    // "pagué el CENS de la casa…" es un pago mensual, no un préstamo
    if (intentarPagoPorVoz(frases)) {
        estadoVoz('');
        return;
    }
    // "gasté 5 mil en un tinto con Nequi" es un gasto propio
    if (intentarGastoPorVoz(frases)) return;

    // La barra de dictado está en todas las pestañas; el formulario vive en Registrar
    cambiarTab('registro');
    const r = VozParser.interpretarMejor(frases, { nombres: nombresUnicos, conceptos: conceptos });
    ultimaInterpretacion = r;
    document.getElementById('fraseRapida').value = r.frase;
    ajustarAlturaFrase(document.getElementById('fraseRapida'));
    aplicarAlFormulario(r);

    if (r.completo) {
        estadoVoz('');
        mostrarConfirmacionVoz(r);
    } else {
        estadoVoz('Falta ' + r.faltantes.join(', ') + '. Complétalo en el formulario.');
        toast('Completa: ' + r.faltantes.join(', '), 'aviso');
    }
}

function aplicarAlFormulario(r) {
    limpiarMarcas();
    const btnNombre = document.getElementById('nombreDropdownBtn');
    const valor = document.getElementById('valor');
    const fecha = document.getElementById('fecha');
    const concepto = document.getElementById('conceptoSelect');

    if (r.nombre) establecerNombre(r.nombre);
    marcar(btnNombre, !!r.nombre);

    if (r.valor) valor.value = r.valor;
    marcar(valor, !!r.valor);

    fecha.value = r.fecha;
    if (r.fechaDicha) marcar(fecha, true);

    if (r.conceptoId) concepto.value = r.conceptoId;
    marcar(concepto, !!r.conceptoId);
    document.getElementById('interesActivo').checked = !!r.tasaMensual;
    document.getElementById('interesTasa').value = r.tasaMensual || '';
    if (r.tasaMensual) marcar(document.getElementById('interesTasa'), true);
    actualizarBadgeTipo();
    const cuenta = VozParser.buscarCuenta(r.frase, cuentas);
    renderChips('cuentaRegistro', 'cuenta', cuenta ? cuenta.id : null);
    if (cuenta) marcar(document.getElementById('cuentaRegistro'), true);

    if (r.comentario) {
        document.getElementById('comentario').value = r.comentario;
        marcar(document.getElementById('comentario'), true);
    }
}

function mostrarConfirmacionVoz(r) {
    const tipoLabel = r.tipo === 'pago' ? 'Pago (resta)' : 'Gasto (te debe)';
    const filas = [
        ['Persona', r.nombre + (r.nombreNuevo ? ' (nueva)' : '')],
        ['Valor', formatearMoneda(r.valor)],
        ['Concepto', r.conceptoNombre],
        ['Tipo', tipoLabel],
        ['Fecha', formatearFecha(r.fecha)]
    ];
    if (r.tasaMensual && esPrestamo(conceptos.find(c => c.id === r.conceptoId))) {
        filas.push(['Interés', `${r.tasaMensual}% mensual (${formatearMoneda(r.valor * r.tasaMensual / 100)} al mes)`]);
    }
    const cuentaVoz = valorChips('cuentaRegistro');
    if (cuentaVoz) filas.push([r.tipo === 'pago' ? 'Entra a' : 'Sale de', nombreCuenta(cuentaVoz)]);
    if (r.comentario) filas.push(['Comentario', r.comentario]);

    document.getElementById('confirmFrase').textContent = `"${r.frase}"`;
    document.getElementById('confirmLista').innerHTML = filas
        .map(([k, v]) => `<li${k === 'Valor' ? ' class="destacado"' : ''}><span>${k}</span><span>${escapeHtml(v)}</span></li>`)
        .join('');
    document.getElementById('modalVoz').classList.add('show');
}

function cerrarConfirmacionVoz() {
    document.getElementById('modalVoz').classList.remove('show');
}

// ========================
// Instalación como app (PWA)
// ========================
let eventoInstalar = null;

function configurarPWA() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW no registrado', err));
    }

    // Pide al navegador no borrar los datos guardados cuando falte espacio
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
    }

    const btn = document.getElementById('btnInstalar');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        eventoInstalar = e;
        btn.classList.add('visible');
    });

    btn.addEventListener('click', async () => {
        if (!eventoInstalar) return;
        eventoInstalar.prompt();
        await eventoInstalar.userChoice;
        eventoInstalar = null;
        btn.classList.remove('visible');
    });

    window.addEventListener('appinstalled', () => {
        btn.classList.remove('visible');
        toast('App instalada. Búscala en tu pantalla de inicio.');
    });
}

// ========================
// Inicialización
// ========================
document.addEventListener('DOMContentLoaded', function() {
    cargarDatos();
    cargarDatosPagos();
    cargarDatosGastos();
    renderChips('cuentaRegistro', 'cuenta', null);
    document.getElementById('fecha').value = hoyISO();
    cargarConceptosSelect();

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() { cambiarTab(this.dataset.tab); });
    });

    document.getElementById('nombreDropdownBtn').addEventListener('click', toggleDropdown);
    document.getElementById('registroForm').addEventListener('submit', procesarFormulario);
    document.getElementById('conceptoSelect').addEventListener('change', function() {
        actualizarBadgeTipo();
        limpiarMarca(this);
    });
    ['valor', 'fecha', 'comentario', 'interesTasa'].forEach(id => {
        document.getElementById(id).addEventListener('input', function() { limpiarMarca(this); });
    });
    document.getElementById('interesActivo').addEventListener('change', function() {
        actualizarCajaInteres();
        if (this.checked) document.getElementById('interesTasa').focus();
    });
    ['valor', 'interesTasa'].forEach(id => {
        document.getElementById(id).addEventListener('input', actualizarCajaInteres);
    });

    document.getElementById('nombreDropdownMenu').addEventListener('click', function(e) {
        const opcion = e.target.closest('.name-option');
        if (opcion) seleccionarNombre(opcion.dataset.nombre);
    });

    document.addEventListener('click', function(event) {
        const dropdown = document.querySelector('.dropdown-container');
        if (dropdownAbierto && dropdown && !dropdown.contains(event.target)) cerrarDropdown();
    });

    // Voz
    document.getElementById('btnMic').addEventListener('click', iniciarDictado);
    document.getElementById('btnInterpretar').addEventListener('click', () => {
        interpretarFrase([document.getElementById('fraseRapida').value]);
    });
    // La frase crece hasta 4 líneas mientras se escribe o se dicta
    const fraseRapida = document.getElementById('fraseRapida');
    fraseRapida.addEventListener('input', () => ajustarAlturaFrase(fraseRapida));
    document.getElementById('fraseRapida').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            interpretarFrase([e.target.value]);
        }
    });
    document.getElementById('btnVozEditar').addEventListener('click', cerrarConfirmacionVoz);
    document.getElementById('btnVozRegistrar').addEventListener('click', () => {
        cerrarConfirmacionVoz();
        document.getElementById('registroForm').requestSubmit();
    });

    configurarPWA();
    actualizarResumen();
    cargarHistorial();

    // Acceso directo "Dictar registro" del ícono de la app
    if (new URLSearchParams(location.search).get('dictar') === '1') {
        setTimeout(iniciarDictado, 400);
    }
});

// Globales para onclick inline
window.exportarJSON = exportarJSON;
window.importarJSON = importarJSON;
window.agregarNombre = agregarNombre;
window.eliminarRegistro = eliminarRegistro;
window.eliminarConcepto = eliminarConcepto;
window.toggleDetalle = toggleDetalle;
window.copiarResumenDeuda = copiarResumenDeuda;
window.abrirAbonoPersona = abrirAbonoPersona;
window.seleccionarTipo = seleccionarTipo;
window.agregarConcepto = agregarConcepto;
window.aplicarFiltros = aplicarFiltros;
window.limpiarFiltros = limpiarFiltros;
window.abrirModalPago = abrirModalPago;
window.cerrarModalPago = cerrarModalPago;
window.confirmarPagoItem = confirmarPagoItem;
