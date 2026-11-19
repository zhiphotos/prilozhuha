// Тексты писем. Пишем для самого неуверенного читателя: крупно, по шагам, без сложных слов. От лица Дарины.
const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const APP = "https://kniga-balanuca.ru/app/";
const HELP_TG = "https://t.me/zhiphotos";
const HELP_MAIL = "darinazizina@gmail.com";

const frame = (title, inner) => `<!doctype html><html lang="ru"><body style="margin:0;background:#f4efe6;font-family:Arial,Helvetica,sans-serif;color:#26301a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:18px;padding:28px 22px;font-size:19px;line-height:1.55">
<p style="margin:0 0 18px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#6b7a4a">Книга рода</p>
<h1 style="margin:0 0 18px;font-size:26px;line-height:1.25">${title}</h1>
${inner}
</div></div></body></html>`;

const button = (href, label) => `<p style="margin:22px 0"><a href="${href}" style="display:block;background:#3f4a22;color:#ffffff;text-decoration:none;text-align:center;font-size:22px;font-weight:bold;padding:18px 12px;border-radius:14px">${label}</a></p>`;
const help = `<p style="margin:22px 0 0;font-size:17px;color:#555">Не получается? Напишите мне, я помогу: <a href="${HELP_TG}" style="color:#3f4a22">в Телеграм</a> или на почту <a href="mailto:${HELP_MAIL}" style="color:#3f4a22">${HELP_MAIL}</a>.</p>`;

/** Письмо после оплаты: что произошло и как войти. */
export function paidMail({ email, order }) {
  const subject = "Вы оплатили Книгу рода. Вот как её открыть";
  const html = frame("Спасибо! Оплата прошла", `
<p style="margin:0 0 6px">Программа «Книга рода» теперь ваша: шесть уроков, помощник и шаблоны. Платить ещё раз не нужно.</p>
${button(APP, "Открыть Книгу рода")}
<p style="margin:0 0 10px;font-weight:bold">Если приложение попросит войти:</p>
<ol style="margin:0 0 16px;padding-left:24px">
<li style="margin-bottom:10px">Нажмите «Уже оплатили?».</li>
<li style="margin-bottom:10px">Впишите вашу почту: <b>${esc(email)}</b>. Это и есть ваш вход, пароль придумывать не нужно.</li>
<li style="margin-bottom:10px">Нажмите «Прислать код». На эту почту придёт письмо с шестью цифрами. Если его нет, загляните в папку «Спам».</li>
<li style="margin-bottom:10px">Впишите эти шесть цифр. Готово, уроки открыты.</li>
</ol>
<p style="margin:0 0 6px"><b>Где уроки?</b> Внизу экрана нажмите «Уроки».</p>
<p style="margin:0 0 6px"><b>Как войти с другого телефона или компьютера?</b> Откройте <a href="${APP}" style="color:#3f4a22">kniga-balanuca.ru/app</a> и сделайте то же самое: почта, потом код. Одной оплатой можно пользоваться на трёх устройствах.</p>
${help}
<p style="margin:18px 0 0;font-size:14px;color:#888">Номер вашего заказа: ${esc(order)}</p>`);
  const text = [
    "Спасибо! Оплата прошла.",
    "Программа «Книга рода» теперь ваша: шесть уроков, помощник и шаблоны.",
    "",
    `Открыть: ${APP}`,
    "",
    "Если приложение попросит войти:",
    "1. Нажмите «Уже оплатили?».",
    `2. Впишите вашу почту: ${email}. Пароль придумывать не нужно.`,
    "3. Нажмите «Прислать код». На почту придёт письмо с шестью цифрами (загляните в «Спам», если нет).",
    "4. Впишите шесть цифр. Готово.",
    "",
    "Уроки: внизу экрана кнопка «Уроки».",
    `Не получается? Напишите мне: ${HELP_TG} или ${HELP_MAIL}`,
    `Номер заказа: ${order}`,
  ].join("\n");
  return { subject, html, text };
}

/** Письмо с кодом для входа. */
export function codeMail({ code }) {
  const subject = `Ваш код для входа: ${code}`;
  const html = frame("Код для входа", `
<p style="margin:0 0 6px">Впишите эти шесть цифр в приложении «Книга рода»:</p>
<p style="margin:18px 0;text-align:center;font-size:44px;font-weight:bold;letter-spacing:.2em;color:#3f4a22">${esc(code)}</p>
<p style="margin:0 0 6px">Код работает 15 минут. Если вы его не просили, просто ничего не делайте.</p>
${help}`);
  const text = `Код для входа в «Книгу рода»: ${code}\nВпишите его в приложении. Код работает 15 минут. Если вы его не просили, ничего не делайте.`;
  return { subject, html, text };
}

/** Письмо дарителю: подарок оплачен, вот ссылка, которую нужно отправить. */
export function giftMadeMail({ to, link }) {
  const who = to ? `. Кому: ${esc(to)}` : "";
  const subject = "Подарок оплачен. Вот ссылка, которую нужно отправить";
  const html = frame("Подарок готов", `
<p style="margin:0 0 6px">Вы оплатили Книгу рода в подарок${who}. Остался один шаг: отправьте человеку эту ссылку в мессенджере или сообщением.</p>
${button(link, "Открыть открытку")}
<p style="margin:0 0 10px;font-weight:bold">Что произойдёт дальше:</p>
<ol style="margin:0 0 16px;padding-left:24px">
<li style="margin-bottom:10px">Человек откроет ссылку и увидит вашу открытку.</li>
<li style="margin-bottom:10px">Нажмёт на неё, подарок распакуется, и доступ откроется.</li>
<li style="margin-bottom:10px">Год доступа считается с того дня, когда он откроет подарок, поэтому торопиться не нужно.</li>
</ol>
<p style="margin:0 0 6px;word-break:break-all;font-size:15px;color:#555">Ссылка: ${esc(link)}</p>
${help}`);
  const text = ["Подарок оплачен.", `Отправьте человеку эту ссылку: ${link}`, "Он откроет открытку, подарок распакуется и доступ откроется. Год доступа считается с дня, когда подарок откроют."].join("\n");
  return { subject, html, text };
}

/** Письмо получателю: вам подарили Книгу рода. */
export function giftForYouMail({ from, to, link }) {
  const name = to ? `${esc(to)}, вам` : "Вам";
  const who = from ? `<p style="margin:0 0 6px">От кого: <b>${esc(from)}</b></p>` : "";
  const subject = "Вам подарили Книгу рода";
  const html = frame("Вам подарок", `
<p style="margin:0 0 6px">${name} подарили Книгу рода: приложение, в котором можно собрать историю своей семьи в одну книгу.</p>
${who}
${button(link, "Открыть подарок")}
<p style="margin:0 0 10px;font-weight:bold">Как это работает:</p>
<ol style="margin:0 0 16px;padding-left:24px">
<li style="margin-bottom:10px">Нажмите кнопку выше, откроется открытка.</li>
<li style="margin-bottom:10px">Нажмите на неё, подарок распакуется.</li>
<li style="margin-bottom:10px">Впишите свою почту, чтобы входить с любого телефона. Год доступа начнётся в этот день.</li>
</ol>
${help}`);
  const text = [`${to ? `${to}, вам` : "Вам"} подарили Книгу рода${from ? `. От кого: ${from}` : ""}.`, `Откройте подарок: ${link}`, "Нажмите на открытку, подарок распакуется. Год доступа начнётся в день, когда вы его откроете."].join("\n");
  return { subject, html, text };
}
