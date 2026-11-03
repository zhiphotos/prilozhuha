/** Ссылка на чат тестировщиков в Telegram. */
export const TESTERS_CHAT_URL = "https://t.me/+ZnvorYkuM9w1MjAy";

/** Готовое приглашение целиком. Ссылка стоит отдельной строкой: мессенджеры сами делают её кликабельной. */
export const INVITE_TEXT = `Привет! ❤️
Приглашаю тебя попробовать «Книгу рода» – приложение, в котором можно создавать, хранить и развивать свою семейную родословную!
Сейчас мы активно развиваем проект и приглашаем желающих присоединиться к тестированию.

Как начать:
1. Вступи в наш Telegram-чат тестировщиков:
${TESTERS_CHAT_URL}
2. Найди закреплённое сообщение – в нём собрана вся важная информация.
3. Прочитай инструкцию по установке и началу работы.
4. Установи приложение на своё устройство и попробуй его возможности.

Приложение доступно на разных устройствах.

В «Книге рода» можно:
• создавать своё семейное древо;
• добавлять родственников и связывать поколения;
• указывать родственные отношения;
• добавлять фотографии;
• сохранять семейную историю;
• работать со своей родословной и дополнять её.

Если заметишь ошибку, что-то непонятное или у тебя появится идея по улучшению – напиши об этом в чате тестировщиков.
Нам очень важна обратная связь! ❤️`;

/** Копирует текст: сначала Clipboard API, при отказе (старый браузер, нет защищённого соединения) запасной способ через скрытое поле. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем запасной способ */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

