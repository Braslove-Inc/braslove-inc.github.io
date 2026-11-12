// Site do Braslove: cadastro, login, minha conta, download do instalador e painel de usuários (admin).
// Toda a proteção dos dados está no banco (regras de acesso do Supabase); esta página só mostra o que o banco libera.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const FUNCOES = {registro: 'Registro de Contratos', cobranca_pagamento: 'Cobrança de Pagamento - Booking',
  cobranca_nf: 'Cobrança de Notas Fiscais', ferramentas: 'Ferramentas'};
const PERFIS = {visitante: 'Visitante', operador: 'Operador', administrador: 'Administrador'};
const SIT = {pendente: 'Aguardando aprovação', aprovado: 'Aprovado', bloqueado: 'Bloqueado'};
const params = new URLSearchParams(location.search);
const cfg = window.BRASLOVE || {};
let sb = null, eu = null, perfil = null, filtroAdm = 'pendente', usuariosAdm = [];

function aviso(txt, tipo){
  const a = $('#aviso'); a.textContent = txt; a.className = 'aviso' + (tipo === 'err' ? ' err' : '');
  clearTimeout(a._t); a._t = setTimeout(() => a.classList.add('hidden'), 5000);
}
function modal(html){ $('#modal').innerHTML = `<div class="fundo"><div class="caixa">${html}</div></div>`; }
function fechar(){ $('#modal').innerHTML = ''; }
function traduz(e){
  const m = String((e && (e.message || e.error_description)) || e || '').toLowerCase();
  if(m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if(m.includes('email not confirmed')) return 'Confirme o seu e-mail antes de entrar: abra o link que enviamos para a sua caixa de entrada.';
  if(m.includes('already registered')) return 'Já existe uma conta com este e-mail. Use Entrar ou Esqueci minha senha.';
  if(m.includes('rate limit')) return 'Muitas tentativas em pouco tempo. Espere alguns minutos.';
  if(m.includes('should be at least') || m.includes('weak')) return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
  if(m.includes('same') && m.includes('password')) return 'A nova senha precisa ser diferente da atual.';
  if(m.includes('failed to fetch')) return 'Sem conexão com o servidor. Confira a internet.';
  return (e && e.message) || 'Algo deu errado. Tente de novo.';
}
const senhaBoa = s => s.length >= 8 && /\d/.test(s) && /[a-zA-Z]/.test(s);

function irPara(pag){
  document.querySelectorAll('.pag').forEach(p => p.classList.toggle('hidden', p.id !== 'pag-' + pag));
  document.querySelectorAll('#menu button[data-pag]').forEach(b => b.classList.toggle('on', b.dataset.pag === pag));
  if(pag === 'conta') renderConta();
  if(pag === 'baixar') renderBaixar();
  if(pag === 'admin') carregarAdmin();
}
document.querySelectorAll('#menu button[data-pag]').forEach(b => b.onclick = () => irPara(b.dataset.pag));

// ------------------------------------------------------------------ entrar / criar conta / esqueci
function telaAuth(aba, msg, tipo){
  aba = aba || 'entrar';
  const m = msg ? `<div class="msg ${tipo || 'err'}">${msg}</div>` : '';
  const abas = `<div class="abas"><button class="${aba === 'entrar' ? 'on' : ''}" onclick="telaAuth('entrar')">Entrar</button>
    <button class="${aba === 'criar' ? 'on' : ''}" onclick="telaAuth('criar')">Criar conta</button></div>`;
  let h;
  if(aba === 'entrar') h = `${abas}${m}
    <label>E-mail<input type="email" id="a_email" autocomplete="username"></label>
    <label>Senha<input type="password" id="a_senha" autocomplete="current-password"></label>
    <button class="btn cheio" id="aOk">Entrar</button>
    <div class="links"><a onclick="telaAuth('esqueci')">Esqueci minha senha</a></div>`;
  else if(aba === 'criar') h = `${abas}${m}
    <label>Nome completo<input id="c_nome" autocomplete="name"></label>
    <div class="dois"><label>Cargo<input id="c_cargo" placeholder="Ex.: Financeiro"></label><label>Telefone<input id="c_tel"></label></div>
    <label>E-mail<input type="email" id="c_email" autocomplete="username"></label>
    <div class="dois"><label>Senha<input type="password" id="c_senha" autocomplete="new-password"></label>
    <label>Repita a senha<input type="password" id="c_senha2" autocomplete="new-password"></label></div>
    <p class="mut" style="margin-top:-4px">Mínimo de 8 caracteres, com letras e números. Depois do cadastro você entra como visitante até a administradora aprovar.</p>
    <button class="btn cheio" id="cOk">Criar conta</button>`;
  else if(aba === 'esqueci') h = `<h2>Esqueci minha senha</h2>${m}
    <p class="mut">Vamos enviar um link para você criar uma senha nova.</p>
    <label>E-mail da conta<input type="email" id="e_email"></label>
    <button class="btn cheio" id="eOk">Enviar link</button>
    <div class="links"><a onclick="telaAuth('entrar')">Voltar</a></div>`;
  else if(aba === 'nova') h = `<h2>Criar uma senha nova</h2>${m}
    <label>Nova senha<input type="password" id="n_senha" autocomplete="new-password"></label>
    <label>Repita a nova senha<input type="password" id="n_senha2" autocomplete="new-password"></label>
    <button class="btn cheio" id="nOk">Salvar a senha nova</button>`;
  $('#cartaoAuth').innerHTML = h;
  irPara('entrada');
  if(aba === 'entrar'){
    const ir = async () => {
      const {error} = await sb.auth.signInWithPassword({email: $('#a_email').value.trim().toLowerCase(), password: $('#a_senha').value});
      if(error) telaAuth('entrar', esc(traduz(error)));
    };
    $('#aOk').onclick = ir; $('#a_senha').onkeydown = e => { if(e.key === 'Enter') ir(); };
    setTimeout(() => $('#a_email').focus(), 30);
  }
  if(aba === 'criar') $('#cOk').onclick = async () => {
    const nome = $('#c_nome').value.trim(), email = $('#c_email').value.trim().toLowerCase(), senha = $('#c_senha').value;
    if(!nome) return telaAuth('criar', 'Informe o seu nome completo.');
    if(senha !== $('#c_senha2').value) return telaAuth('criar', 'As senhas não são iguais.');
    if(!senhaBoa(senha)) return telaAuth('criar', 'A senha precisa ter pelo menos 8 caracteres, com letras e números.');
    $('#cOk').disabled = true;
    const {data, error} = await sb.auth.signUp({email, password: senha, options: {
      emailRedirectTo: location.origin + location.pathname + '?confirmado=1',
      data: {nome_completo: nome, cargo: $('#c_cargo').value.trim(), telefone: $('#c_tel').value.trim()}}});
    if(error) return telaAuth('criar', esc(traduz(error)));
    if(!data.session) telaAuth('entrar', `Enviamos um e-mail para <b>${esc(email)}</b>. Clique no link da mensagem para confirmar a conta e depois entre aqui. (Veja também o spam.)`, 'ok');
  };
  if(aba === 'esqueci') $('#eOk').onclick = async () => {
    const email = $('#e_email').value.trim().toLowerCase();
    if(!email.includes('@')) return telaAuth('esqueci', 'Informe o e-mail da conta.');
    const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname + '?redefinir=1'});
    if(error) return telaAuth('esqueci', esc(traduz(error)));
    telaAuth('entrar', `Se existir uma conta com <b>${esc(email)}</b>, o link para criar uma senha nova já foi enviado.`, 'ok');
  };
  if(aba === 'nova') $('#nOk').onclick = async () => {
    const s = $('#n_senha').value;
    if(s !== $('#n_senha2').value) return telaAuth('nova', 'As senhas não são iguais.');
    if(!senhaBoa(s)) return telaAuth('nova', 'A senha precisa ter pelo menos 8 caracteres, com letras e números.');
    const {error} = await sb.auth.updateUser({password: s});
    if(error) return telaAuth('nova', esc(traduz(error)));
    history.replaceState(null, '', location.pathname);
    aviso('Senha nova salva. Você já pode usá-la no programa.');
    entrou();
  };
}

// ------------------------------------------------------------------ sessão
async function lerPerfil(){
  const {data, error} = await sb.from('profiles').select('*').eq('id', eu.id).single();
  if(error) throw error;
  perfil = data; return data;
}
async function entrou(){
  try{ await lerPerfil(); }catch(e){ aviso(traduz(e), 'err'); return; }
  $('#menu').classList.remove('hidden');
  const admin = perfil.perfil === 'administrador' && perfil.status === 'aprovado';
  document.querySelectorAll('.so-admin').forEach(b => b.classList.toggle('hidden', !admin));
  if(perfil.status === 'bloqueado'){
    await sb.auth.signOut();
    return telaAuth('entrar', 'Esta conta está bloqueada. Fale com a administradora do Braslove.');
  }
  const p = params.get('pagina');
  history.replaceState(null, '', location.pathname);
  irPara(p === 'admin' && admin ? 'admin' : p === 'baixar' ? 'baixar' : 'conta');
}
$('#btnSair').onclick = async () => { await sb.auth.signOut(); };

// ------------------------------------------------------------------ minha conta
function renderConta(){
  if(!perfil) return;
  const st = perfil.status, funcs = Object.entries(FUNCOES).filter(([k]) => perfil.perfil === 'administrador' || (perfil.permissoes || {})[k]);
  const ic = {pendente: '⏳', aprovado: '✅', bloqueado: '⛔'}[st];
  const txt = st === 'pendente'
    ? 'Sua conta foi criada e está como <b>visitante</b>. Você já pode baixar e instalar o programa; as funções aparecem quando a administradora aprovar.'
    : st === 'aprovado' ? `Perfil <b>${esc(PERFIS[perfil.perfil])}</b>. Funções liberadas: ${funcs.length ? funcs.map(([, t]) => `<span class="tag f">${esc(t)}</span>`).join('') : '<span class="mut">nenhuma ainda</span>'}`
    : 'Conta bloqueada.';
  $('#situacao').innerHTML = `<div class="cartao"><div class="situacao ${st}"><div class="ic">${ic}</div>
    <div><h2 style="margin:0 0 4px">Olá, ${esc((perfil.nome_completo || perfil.email).split(' ')[0])}! <span class="tag ${st}">${SIT[st]}</span></h2><div>${txt}</div></div></div></div>`;
  $('#mc_email').value = perfil.email; $('#mc_nome').value = perfil.nome_completo; $('#mc_cargo').value = perfil.cargo; $('#mc_tel').value = perfil.telefone;
}
$('#mcSalvar').onclick = async () => {
  const d = {nome_completo: $('#mc_nome').value.trim(), cargo: $('#mc_cargo').value.trim(), telefone: $('#mc_tel').value.trim()};
  if(!d.nome_completo) return aviso('O nome não pode ficar vazio.', 'err');
  const {error} = await sb.from('profiles').update(d).eq('id', eu.id);
  if(error) return aviso(traduz(error), 'err');
  await lerPerfil(); renderConta(); aviso('Dados salvos.');
};
$('#mcSenha').onclick = async () => {
  const s = $('#mc_nova').value;
  if(s !== $('#mc_nova2').value) return aviso('As senhas não são iguais.', 'err');
  if(!senhaBoa(s)) return aviso('A senha precisa ter pelo menos 8 caracteres, com letras e números.', 'err');
  const {error} = await sb.auth.updateUser({password: s});
  if(error) return aviso(traduz(error), 'err');
  $('#mc_nova').value = $('#mc_nova2').value = ''; aviso('Senha trocada.');
};

// ------------------------------------------------------------------ baixar o programa
async function renderBaixar(){
  const box = $('#baixarBox'); box.innerHTML = '<div class="vazio">Carregando…</div>';
  const {data, error} = await sb.from('versoes').select('*').order('publicado_em', {ascending: false}).limit(1);
  if(error) return box.innerHTML = `<div class="msg err">${esc(traduz(error))}</div>`;
  const v = data && data[0];
  if(!v){ box.innerHTML = '<h2>Baixar o Braslove</h2><div class="vazio">O instalador ainda não foi publicado. Volte mais tarde.</div>'; return; }
  const mb = v.tamanho ? ` · ${(v.tamanho / 1048576).toFixed(0)} MB` : '';
  box.innerHTML = `<div class="baixar"><img src="img/logo_app_192.png" alt=""><div style="flex:1;min-width:240px">
      <h2 style="margin-bottom:4px">Braslove ${esc(v.versao)}</h2>
      <div class="mut">Para Windows 10 e 11 · publicado em ${new Date(v.publicado_em).toLocaleDateString('pt-BR')}${mb}</div></div>
      <button class="btn" id="bxOk">Baixar o instalador</button></div>
    <ol class="passos"><li>Abra o arquivo <b>Braslove_Setup.exe</b> que você baixou. Se o Windows mostrar “O Windows protegeu o computador”, clique em <b>Mais informações → Executar assim mesmo</b>.</li>
      <li>Siga o assistente. Não precisa de senha de administrador do computador.</li>
      <li>No fim, o instalador baixa o navegador usado para ler o Aboss (precisa de internet).</li>
      <li>Abra o Braslove e entre com o mesmo e-mail e senha deste site.</li></ol>
    ${v.notas ? `<p class="mut">${esc(v.notas)}</p>` : ''}`;
  $('#bxOk').onclick = async () => {
    const {data: url, error: e2} = await sb.storage.from('instaladores').createSignedUrl(v.arquivo, 300, {download: 'Braslove_Setup.exe'});
    if(e2) return aviso(traduz(e2), 'err');
    location.href = url.signedUrl;
  };
}

// ------------------------------------------------------------------ painel de usuários (admin)
document.querySelectorAll('#filtroAdm button').forEach(b => b.onclick = () => {
  filtroAdm = b.dataset.f; document.querySelectorAll('#filtroAdm button').forEach(x => x.classList.toggle('on', x === b)); renderAdmin();
});
async function carregarAdmin(){
  $('#tabAdm').innerHTML = '<div class="vazio">Carregando…</div>';
  const {data, error} = await sb.from('profiles').select('*').order('criado_em', {ascending: false});
  if(error) return $('#tabAdm').innerHTML = `<div class="msg err">${esc(traduz(error))}</div>`;
  usuariosAdm = data; renderAdmin();
  const ev = await sb.from('eventos').select('*').order('quando', {ascending: false}).limit(30);
  const nome = id => (usuariosAdm.find(u => u.id === id) || {}).nome_completo || (usuariosAdm.find(u => u.id === id) || {}).email || '—';
  $('#eventosAdm').innerHTML = ev.error ? `<div class="msg err">${esc(traduz(ev.error))}</div>` : !ev.data.length ? '<div class="vazio">Nada ainda.</div>' :
    `<div class="tabela"><table><tr><th>Quando</th><th>Conta</th><th>O que aconteceu</th><th>Por</th></tr>${ev.data.map(e => `<tr>
      <td style="white-space:nowrap">${new Date(e.quando).toLocaleString('pt-BR')}</td><td>${esc(nome(e.usuario))}</td>
      <td>${e.acao === 'cadastro' ? 'Criou a conta' : esc(e.detalhe)}</td><td>${e.autor ? esc(nome(e.autor)) : '—'}</td></tr>`).join('')}</table></div>`;
}
function renderAdmin(){
  const n = usuariosAdm.filter(u => u.status === 'pendente').length;
  $('#nPend').textContent = n ? `(${n})` : '';
  const l = usuariosAdm.filter(u => filtroAdm === 'todos' || u.status === filtroAdm);
  if(!l.length){ $('#tabAdm').innerHTML = `<div class="vazio">${filtroAdm === 'pendente' ? 'Ninguém aguardando aprovação.' : 'Nenhuma conta aqui.'}</div>`; return; }
  $('#tabAdm').innerHTML = `<div class="tabela"><table><tr><th>Pessoa</th><th>Situação</th><th>Perfil e funções</th><th>Último acesso</th><th></th></tr>
    ${l.map(u => `<tr><td><b>${esc(u.nome_completo || '—')}</b><div class="mut">${esc(u.email)}${u.cargo ? ' · ' + esc(u.cargo) : ''}</div>
        <div class="mut">Conta criada em ${new Date(u.criado_em).toLocaleDateString('pt-BR')}</div></td>
      <td><span class="tag ${u.status}">${SIT[u.status]}</span></td>
      <td>${esc(PERFIS[u.perfil])}<div>${u.perfil === 'administrador' ? '<span class="tag f">todas</span>' : Object.entries(FUNCOES).filter(([k]) => (u.permissoes || {})[k]).map(([, t]) => `<span class="tag f">${esc(t)}</span>`).join('')}</div></td>
      <td class="mut">${u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : '—'}${u.versao_programa ? '<br>programa v' + esc(u.versao_programa) : ''}</td>
      <td style="white-space:nowrap"><button class="btn sm${u.status === 'pendente' ? '' : ' sec'}" onclick="editarUsuario('${u.id}')">${u.status === 'pendente' ? 'Aprovar' : 'Editar'}</button></td></tr>`).join('')}</table></div>`;
}
function editarUsuario(id){
  const u = usuariosAdm.find(x => x.id === id), eh = u.id === eu.id;
  const perf = u.perfil === 'visitante' ? 'operador' : u.perfil, perm = u.permissoes || {};
  modal(`<h3>${esc(u.nome_completo || u.email)}</h3><p class="mut">${esc(u.email)}${u.cargo ? ' · ' + esc(u.cargo) : ''}</p>
    <label>Situação<select id="eu_st">${Object.entries(SIT).map(([k, t]) => `<option value="${k}" ${k === (u.status === 'pendente' ? 'aprovado' : u.status) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label>Perfil<select id="eu_pf">${['visitante', 'operador', 'administrador'].map(k => `<option value="${k}" ${k === perf ? 'selected' : ''}>${PERFIS[k]}</option>`).join('')}</select></label>
    <div id="eu_funcs"><div class="mut" style="font-weight:600">Funções que esta pessoa pode usar</div>
      ${Object.entries(FUNCOES).map(([k, t]) => `<label class="check"><input type="checkbox" value="${k}" ${perm[k] || u.status === 'pendente' && k !== 'ferramentas' ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
    <p class="mut">Administrador usa todas as funções e gerencia contas e configurações. Visitante não usa nenhuma função.${eh ? ' Esta é a sua própria conta.' : ''}</p>
    <div class="rodape"><button class="btn sec" onclick="fechar()">Cancelar</button><button class="btn" id="euOk">Salvar</button></div>`);
  const sinc = () => { const pf = $('#eu_pf').value; $('#eu_funcs').classList.toggle('hidden', pf !== 'operador'); };
  $('#eu_pf').onchange = sinc; sinc();
  $('#euOk').onclick = async () => {
    const pf = $('#eu_pf').value, permissoes = {};
    document.querySelectorAll('#eu_funcs input').forEach(c => permissoes[c.value] = pf === 'administrador' || (pf === 'operador' && c.checked));
    const {error} = await sb.from('profiles').update({status: $('#eu_st').value, perfil: pf, permissoes}).eq('id', id);
    if(error) return aviso(traduz(error), 'err');
    fechar(); aviso('Conta atualizada. A pessoa vê a mudança no programa em até 2 minutos.'); carregarAdmin();
  };
}

// ------------------------------------------------------------------ início
(function iniciar(){
  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey){
    $('#cartaoAuth').innerHTML = '<h2>Site em configuração</h2><p class="mut">O Braslove ainda está sendo ligado ao servidor. Volte em breve.</p>';
    irPara('entrada'); return;
  }
  sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth: {persistSession: true, detectSessionInUrl: true, flowType: 'implicit'}});
  let recuperando = params.has('redefinir') || location.hash.includes('type=recovery');
  sb.auth.onAuthStateChange((evento, sessao) => {
    if(evento === 'PASSWORD_RECOVERY'){ recuperando = true; eu = sessao.user; return telaAuth('nova'); }
    if(evento === 'SIGNED_OUT'){ eu = perfil = null; $('#menu').classList.add('hidden'); return telaAuth('entrar'); }
    if(sessao && sessao.user && (!eu || eu.id !== sessao.user.id)){
      eu = sessao.user;
      if(recuperando) return telaAuth('nova');
      setTimeout(entrou, 0);
    }
  });
  sb.auth.getSession().then(({data}) => {
    if(data.session) return;  // onAuthStateChange cuida
    if(params.has('confirmado')) telaAuth('entrar', 'E-mail confirmado! Agora é só entrar.', 'ok');
    else if(params.get('erro') || location.hash.includes('error')) telaAuth('entrar', 'O link expirou ou já foi usado. Peça um novo.', 'err');
    else telaAuth(params.get('pagina') === 'criar' ? 'criar' : 'entrar');
  });
})();
