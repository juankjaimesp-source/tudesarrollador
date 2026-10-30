// ========================
// Mis gastos (gastos personales por categoría) y cuentas (de dónde sale o a dónde entra la plata)
// - cuenta:    { id, nombre }
// - categoria: { id, nombre }
// - gasto:     { id, descripcion, valor, fecha: 'YYYY-MM-DD', categoriaId, cuentaId }
// Los préstamos, abonos y pagos del mes guardan cuentaId opcional.
// ========================
let cuentas = [];
let categoriasGasto = [];
let gastos = [];
let periodoGastos = null;
let alCrearItem = null;

const CUENTAS_INICIALES = ['Efectivo', 'Nequi', 'Daviplata', 'Davivienda', 'Falabella', 'NuBank'];
const CATEGORIAS_INICIALES = ['Gastos hormiga', 'Mercado', 'Transporte', 'Otros'];

function cargarDatosGastos() {
    const base = Date.now();
    const guardadas = localStorage.getItem('controlCuentas');
    cuentas = guardadas ? JSON.parse(guardadas) : CUENTAS_INICIALES.map((nombre, i) => ({ id: base + i, nombre }));
    const guardadasCat = localStorage.getItem('controlCategorias');
    categoriasGasto = guardadasCat ? JSON.parse(guardadasCat) : CATEGORIAS_INICIALES.map((nombre, i) => ({ id: base + 100 + i, nombre }));
    gastos = JSON.parse(localStorage.getItem('controlGastos') || '[]');
    if (!guardadas) guardarCuentas();
    if (!guardadasCat) guardarCategorias();
    periodoGastos = periodoDe(new Date());
}

function guardarCuentas() { localStorage.setItem('controlCuentas', JSON.stringify(cuentas)); }
function guardarCategorias() { localStorage.setItem('controlCategorias', JSON.stringify(categoriasGasto)); }
function guardarGastos() { localStorage.setItem('controlGastos', JSON.stringify(gastos)); }

function nombreCuenta(id) {
    const c = cuentas.find(x => x.id === id);
    return c ? c.nombre : '';
}

function nombreCategoria(id) {
    const c = categoriasGasto.find(x => x.id === id);
    return c ? c.nombre : 'Sin categoría';
}

// ========================
// Selector de chips (cuenta / categoría) con opción de crear una nueva
// ========================
// tipo: 'cuenta' | 'categoria'. La selección vive en data-valor del contenedor.
function renderChips(contenedorId, tipo, seleccion) {
    const cont = document.getElementById(contenedorId);
    const items = tipo === 'cuenta' ? cuentas : categoriasGasto;
    if (seleccion !== undefined) cont.dataset.valor = seleccion || '';
    const actual = parseInt(cont.dataset.valor) || null;
    cont.innerHTML = items.map(i => `
        <button type="button" class="chip${i.id === actual ? ' activo' : ''}" data-id="${i.id}">${escapeHtml(i.nombre)}</button>
    `).join('') + `<button type="button" class="chip chip-nuevo" data-nuevo="${tipo}">+ Nueva</button>`;
    cont.dataset.tipo = tipo;
}

function valorChips(contenedorId) {
    return parseInt(document.getElementById(contenedorId).dataset.valor) || null;
}

function seleccionarChip(contenedorId, id) {
    const cont = document.getElementById(contenedorId);
    renderChips(contenedorId, cont.dataset.tipo, id);
    limpiarMarca(cont);
}

// Clic en cualquier grupo de chips: seleccionar (o quitar) / crear nuevo
document.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const cont = chip.parentElement;
    if (chip.dataset.nuevo) {
        abrirNuevoItem(chip.dataset.nuevo, (nuevo) => seleccionarChip(cont.id, nuevo.id));
        return;
    }
    const id = parseInt(chip.dataset.id);
    seleccionarChip(cont.id, parseInt(cont.dataset.valor) === id ? null : id);
    if (cont.dataset.tipo === 'cuenta' && parseInt(cont.dataset.valor)) {
        localStorage.setItem('ultimaCuenta', cont.dataset.valor);
    }
});

function ultimaCuenta() {
    const id = parseInt(localStorage.getItem('ultimaCuenta'));
    return cuentas.some(c => c.id === id) ? id : null;
}

// ========================
// Crear cuenta / categoría
// ========================
function abrirNuevoItem(tipo, callback) {
    alCrearItem = { tipo, callback };
    document.getElementById('modalNuevoItemTitulo').textContent = tipo === 'cuenta' ? 'Nueva cuenta' : 'Nueva categoría';
    document.getElementById('nuevoItemNombre').placeholder = tipo === 'cuenta' ? 'Bancolombia, Lulo, tarjeta…' : 'Salidas, mascotas, salud…';
    document.getElementById('nuevoItemNombre').value = '';
    document.getElementById('modalNuevoItem').classList.add('show');
    setTimeout(() => document.getElementById('nuevoItemNombre').focus(), 100);
}

function cerrarNuevoItem() {
    document.getElementById('modalNuevoItem').classList.remove('show');
    alCrearItem = null;
}

function guardarNuevoItem() {
    if (!alCrearItem) return;
    const nombre = document.getElementById('nuevoItemNombre').value.trim();
    if (!nombre) { toast('Escribe un nombre', 'aviso'); return; }
    const lista = alCrearItem.tipo === 'cuenta' ? cuentas : categoriasGasto;
    if (lista.some(x => x.nombre.toLowerCase() === nombre.toLowerCase())) { toast('Ya existe con ese nombre', 'aviso'); return; }

    const nuevo = { id: Date.now(), nombre };
    lista.push(nuevo);
    if (alCrearItem.tipo === 'cuenta') guardarCuentas();
    else guardarCategorias();
    const callback = alCrearItem.callback;
    cerrarNuevoItem();
    if (callback) callback(nuevo);
    cargarAjustesListas();
    toast(`"${nombre}" agregada`);
}

// ========================
// Pestaña Mis gastos
// ========================
function cambiarPeriodoGastos(meses) {
    periodoGastos = moverPeriodo(periodoGastos, meses);
    cargarGastos();
}

function prepararFormGasto() {
    const cont = document.getElementById('gastoCuenta');
    renderChips('gastoCategoria', 'categoria', document.getElementById('gastoCategoria').dataset.valor || null);
    renderChips('gastoCuenta', 'cuenta', cont.dataset.valor || ultimaCuenta());
    if (!document.getElementById('gastoFecha').value) document.getElementById('gastoFecha').value = hoyISO();
}

function guardarGasto() {
    const descripcion = document.getElementById('gastoDescripcion').value.trim();
    const valor = parseFloat(document.getElementById('gastoValor').value);
    const fecha = document.getElementById('gastoFecha').value;
    const categoriaId = valorChips('gastoCategoria');
    const cuentaId = valorChips('gastoCuenta');

    if (!valor || valor <= 0) { toast('Escribe el valor del gasto', 'aviso'); return; }
    if (!categoriaId) { toast('Elige una categoría', 'aviso'); return; }
    if (!fecha) { toast('Elige la fecha', 'aviso'); return; }

    gastos.push({
        id: Date.now(),
        descripcion: descripcion || nombreCategoria(categoriaId),
        valor,
        fecha,
        categoriaId,
        cuentaId
    });
    guardarGastos();
    contarEvento('registro-gasto');
    if (cuentaId) localStorage.setItem('ultimaCuenta', cuentaId);

    document.getElementById('gastoDescripcion').value = '';
    document.getElementById('gastoValor').value = '';
    document.getElementById('gastoFecha').value = hoyISO();
    document.getElementById('gastoCategoria').dataset.valor = '';
    document.getElementById('fraseRapida').value = '';
    ajustarAlturaFrase(document.getElementById('fraseRapida'));
    limpiarMarcas();
    periodoGastos = fecha.slice(0, 7);
    cargarGastos();
    toast(`Gasto registrado\n${descripcion || nombreCategoria(categoriaId)}: ${formatearMoneda(valor)}${cuentaId ? ' · ' + nombreCuenta(cuentaId) : ''}`);
}

function eliminarGasto(id) {
    const g = gastos.find(x => x.id === id);
    if (!g || !confirm(`¿Eliminar "${g.descripcion}" (${formatearMoneda(g.valor)})?`)) return;
    gastos = gastos.filter(x => x.id !== id);
    guardarGastos();
    cargarGastos();
    toast('Gasto eliminado');
}

function cargarGastos() {
    document.getElementById('periodoGastosLabel').textContent = nombrePeriodo(periodoGastos);
    prepararFormGasto();

    const delMes = gastos.filter(g => g.fecha.startsWith(periodoGastos));
    const total = delMes.reduce((s, g) => s + g.valor, 0);

    // Total y barras por categoría
    const porCategoria = {};
    delMes.forEach(g => { porCategoria[g.categoriaId] = (porCategoria[g.categoriaId] || 0) + g.valor; });
    const filasCat = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
    const maximo = filasCat.length ? filasCat[0][1] : 1;
    document.getElementById('gastosResumen').innerHTML = `
        <div class="resumen resumen-gastos">
            <span class="resumen-label">Gastaste en ${escapeHtml(nombrePeriodo(periodoGastos).split(' ')[0])}</span>
            <span class="resumen-total">${formatearMoneda(total)}</span>
            ${filasCat.map(([id, v]) => `
                <div class="cat-fila${nombreCategoria(+id).toLowerCase().includes('hormiga') ? ' cat-hormiga' : ''}">
                    <span>${escapeHtml(nombreCategoria(+id))}</span>
                    <b>${formatearMoneda(v)}</b>
                    <i style="width:${Math.max(4, v / maximo * 100)}%"></i>
                </div>
            `).join('')}
        </div>
    `;

    cargarResumenCuentas();

    // Lista agrupada por día
    const lista = document.getElementById('gastosLista');
    if (!delMes.length) {
        lista.innerHTML = '<div class="no-data"><strong>Sin gastos este mes</strong>Dicta "gasté 5 mil en un tinto con Nequi" o usa el formulario.</div>';
        return;
    }
    let html = '';
    let dia = null;
    [...delMes].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id).forEach(g => {
        if (g.fecha !== dia) {
            dia = g.fecha;
            html += `<div class="grupo-fecha">${escapeHtml(etiquetaFecha(g.fecha))}</div>`;
        }
        html += `
            <div class="gasto-item">
                <div class="gasto-info">
                    <div class="gasto-desc">${escapeHtml(g.descripcion)}</div>
                    <div class="gasto-meta">${escapeHtml(nombreCategoria(g.categoriaId))}${g.cuentaId ? ' · ' + escapeHtml(nombreCuenta(g.cuentaId)) : ''}</div>
                </div>
                <div class="gasto-valor">${formatearMoneda(g.valor)}</div>
                <button class="btn-delete" onclick="eliminarGasto(${g.id})" aria-label="Eliminar gasto">${ICONOS.borrar}</button>
            </div>
        `;
    });
    lista.innerHTML = html;
}

// Cuánto salió y entró por cada cuenta en el mes (gastos, pagos del mes, préstamos y abonos)
function cargarResumenCuentas() {
    const mes = periodoGastos;
    const movimientos = {};
    const sumar = (cuentaId, campo, valor) => {
        const k = cuentaId || 'sin';
        movimientos[k] = movimientos[k] || { salio: 0, entro: 0 };
        movimientos[k][campo] += valor;
    };
    gastos.filter(g => g.fecha.startsWith(mes)).forEach(g => sumar(g.cuentaId, 'salio', g.valor));
    pagosMes.filter(p => (p.fechaPago || '').startsWith(mes)).forEach(p => sumar(p.cuentaId, 'salio', p.valor));
    // Préstamos y abonos solo cuentan si tienen cuenta (los anteriores a esta versión no la tienen)
    transacciones.filter(t => t.cuentaId && (t.fechaOriginal || '').startsWith(mes)).forEach(t => {
        sumar(t.cuentaId, t.tipo === 'pago' ? 'entro' : 'salio', t.valor);
    });

    const filas = Object.entries(movimientos)
        .sort((a, b) => (b[1].salio + b[1].entro) - (a[1].salio + a[1].entro));
    const cont = document.getElementById('gastosCuentas');
    if (!filas.length) { cont.innerHTML = ''; return; }
    cont.innerHTML = `
        <div class="tarjeta cuentas-mes">
            <h3 class="tarjeta-titulo">Por cuenta</h3>
            <p class="tarjeta-texto">Incluye gastos, pagos del mes, préstamos que hiciste y abonos que recibiste.</p>
            ${filas.map(([id, m]) => `
                <div class="cuenta-fila">
                    <span>${id === 'sin' ? 'Sin cuenta' : escapeHtml(nombreCuenta(+id))}</span>
                    <span>
                        ${m.salio ? `<b class="balance-positivo">−${formatearMoneda(m.salio)}</b>` : ''}
                        ${m.entro ? `<b class="balance-negativo">+${formatearMoneda(m.entro)}</b>` : ''}
                    </span>
                </div>
            `).join('')}
        </div>
    `;
}

// ========================
// Ajustes: administrar cuentas y categorías
// ========================
function cargarAjustesListas() {
    const pintar = (contId, items, enUso, tipo) => {
        const cont = document.getElementById(contId);
        if (!cont) return;
        cont.innerHTML = items.map(i => `
            <span class="chip chip-fijo">
                ${escapeHtml(i.nombre)}
                ${enUso(i.id) ? '' : `<button type="button" onclick="eliminarItemLista('${tipo}', ${i.id})" aria-label="Eliminar ${escapeHtml(i.nombre)}">×</button>`}
            </span>
        `).join('') + `<button type="button" class="chip chip-nuevo" data-nuevo="${tipo}">+ Nueva</button>`;
    };
    pintar('listaCuentas', cuentas, id =>
        gastos.some(g => g.cuentaId === id) || pagosMes.some(p => p.cuentaId === id) || transacciones.some(t => t.cuentaId === id), 'cuenta');
    pintar('listaCategorias', categoriasGasto, id => gastos.some(g => g.categoriaId === id), 'categoria');
}

function eliminarItemLista(tipo, id) {
    const lista = tipo === 'cuenta' ? cuentas : categoriasGasto;
    const item = lista.find(x => x.id === id);
    if (!item || !confirm(`¿Eliminar "${item.nombre}"?`)) return;
    if (tipo === 'cuenta') {
        cuentas = cuentas.filter(x => x.id !== id);
        guardarCuentas();
    } else {
        categoriasGasto = categoriasGasto.filter(x => x.id !== id);
        guardarCategorias();
    }
    cargarAjustesListas();
}

// ========================
// Dictado de gastos
// ========================
function intentarGastoPorVoz(frases) {
    for (const frase of frases) {
        const r = VozParser.interpretarGasto(frase, { categorias: categoriasGasto, cuentas, nombres: nombresUnicos });
        if (!r) continue;
        cambiarTab('gastos');
        const desc = document.getElementById('gastoDescripcion');
        const valor = document.getElementById('gastoValor');
        const fecha = document.getElementById('gastoFecha');
        desc.value = r.descripcion;
        marcar(desc, true);
        if (r.valor) valor.value = r.valor;
        marcar(valor, !!r.valor);
        fecha.value = r.fecha;
        renderChips('gastoCategoria', 'categoria', r.categoriaId);
        marcar(document.getElementById('gastoCategoria'), !!r.categoriaId);
        if (r.cuentaId) {
            renderChips('gastoCuenta', 'cuenta', r.cuentaId);
            marcar(document.getElementById('gastoCuenta'), true);
        }
        const falta = [!r.valor && 'valor', !r.categoriaId && 'categoría'].filter(Boolean);
        estadoVoz(falta.length ? `Falta ${falta.join(' y ')}. Complétalo y toca Guardar gasto.` : 'Revisa y toca Guardar gasto.');
        document.querySelector('.content').scrollTop = 0;
        return true;
    }
    return false;
}

window.cambiarPeriodoGastos = cambiarPeriodoGastos;
window.guardarGasto = guardarGasto;
window.eliminarGasto = eliminarGasto;
window.cerrarNuevoItem = cerrarNuevoItem;
window.guardarNuevoItem = guardarNuevoItem;
window.eliminarItemLista = eliminarItemLista;
