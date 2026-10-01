function sentence(value: string): string {
  const text = value.trim();
  if (!text) return "";
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

function prose(parts: Array<string | false | undefined>): string {
  const body = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.trim())
    .join("\n\n");
  return body || "В этой истории пока пусто. Вернитесь и запишите хотя бы одну деталь — её достаточно, чтобы глава началась.";
}

export function composeStory(templateId: string, title: string, answers: Record<string, string>): string {
  const a = (key: string) => answers[key]?.trim() ?? "";
  const opening = title.trim() ? title.trim() : "Семейная история";

  switch (templateId) {
    case "first-love":
      return prose([
        opening,
        [a("who") && sentence(a("who")), a("where") && `Место, где это было: ${sentence(a("where"))}`, a("feel") && sentence(a("feel"))]
          .filter(Boolean)
          .join(" "),
        a("detail") && `До сих пор вспоминается вот это. ${sentence(a("detail"))}`,
        a("end") && `Дальше было так. ${sentence(a("end"))}`,
        a("why") && `В книге рода эта история нужна не как роман, а как часть меня. ${sentence(a("why"))}`,
      ]);
    case "parents-met":
      return prose([
        opening,
        [a("names") && sentence(a("names")), a("where") && `Место встречи: ${sentence(a("where"))}`, a("when") && `Это было ${sentence(a("when"))}`]
          .filter(Boolean)
          .join(" "),
        a("step") && `Первый шаг. ${sentence(a("step"))}`,
        a("detail") && `В семейном рассказе всегда есть одна и та же деталь. ${sentence(a("detail"))}`,
        a("legacy") && `Из этой встречи в нас осталось следующее. ${sentence(a("legacy"))}`,
      ]);
    case "first-home":
      return prose([
        opening,
        [a("where") && `Первый дом был здесь: ${sentence(a("where"))}`, a("who") && `Вместе жили ${sentence(a("who"))}`]
          .filter(Boolean)
          .join(" "),
        a("look") && `Если закрыть глаза, видно вот что. ${sentence(a("look"))}`,
        a("sense") && sentence(a("sense")),
        a("lost") && `Не сохранилось вот это. ${sentence(a("lost"))}`,
        a("remains") && `Домашним с тех пор осталось другое. ${sentence(a("remains"))}`,
      ]);
    case "hard-time":
      return prose([
        opening,
        [a("what") && sentence(a("what")), a("when") && `Длилось это ${a("when")}.`].filter(Boolean).join(" "),
        a("how") && `Изо дня в день это выглядело так. ${sentence(a("how"))}`,
        a("help") && `Рядом был человек. ${sentence(a("help"))}`,
        a("phrase") && `Тогда повторяли: «${a("phrase").replace(/[«»"]/g, "")}».`,
        a("taught") && sentence(a("taught")),
      ]);
    case "happiest":
      return prose([
        opening,
        [a("day") && sentence(a("day")), a("who") && `Рядом были ${a("who")}.`].filter(Boolean).join(" "),
        a("detail") && `День держится на детали. ${sentence(a("detail"))}`,
        a("said") && `Кто-то сказал: «${a("said").replace(/[«»"]/g, "")}».`,
        a("why") && sentence(a("why")),
        a("keep") && `От того дня осталось вот что. ${sentence(a("keep"))}`,
      ]);
    case "child":
      return prose([
        opening,
        [a("name") && sentence(a("name")), a("when") && sentence(a("when"))].filter(Boolean).join(" "),
        a("feel") && `В первую минуту было так. ${sentence(a("feel"))}`,
        a("near") && `Рядом. ${sentence(a("near"))}`,
        a("detail") && `Мелочь, которую не хочется потерять. ${sentence(a("detail"))}`,
        a("wish") && `Тебе, если ты это читаешь. ${sentence(a("wish"))}`,
      ]);
    case "wedding":
      return prose([
        opening,
        [a("whose") && sentence(a("whose")), a("where") && `Играли ${a("where")}.`].filter(Boolean).join(" "),
        a("detail") && sentence(a("detail")),
        a("moment") && `Один момент я хочу оставить как есть. ${sentence(a("moment"))}`,
        a("who") && sentence(a("who")),
        a("after") && `После этого дня в семье живёт вот это. ${sentence(a("after"))}`,
      ]);
    case "little-money":
      return prose([
        opening,
        [a("when") && `Это было ${a("when")}.`, a("how") && sentence(a("how"))].filter(Boolean).join(" "),
        a("story") && `В семье до сих пор рассказывают такой случай. ${sentence(a("story"))}`,
        a("hide") && `Дети тогда не видели всего. ${sentence(a("hide"))}`,
        a("rich") && `Богатством в том времени было другое. ${sentence(a("rich"))}`,
        a("now") && `Сейчас я слышу это так. ${sentence(a("now"))}`,
      ]);
    case "moving":
      return prose([
        opening,
        [a("from") && `Переезд: ${sentence(a("from"))}`, a("why") && `В семье это объясняли так. ${sentence(a("why"))}`]
          .filter(Boolean)
          .join(" "),
        a("taken") && `С собой взяли в первую очередь вот это. ${sentence(a("taken"))}`,
        a("left") && `Оставили. ${sentence(a("left"))}`,
        a("night") && `Первая ночь. ${sentence(a("night"))}`,
        a("home") && sentence(a("home")),
      ]);
    case "tradition":
      return prose([
        opening,
        [a("what") && sentence(a("what")), a("who") && `Началось это так: ${sentence(a("who"))}`].filter(Boolean).join(" "),
        a("how") && `Как это бывает. ${sentence(a("how"))}`,
        a("year") && `Особенно помнится один раз. ${sentence(a("year"))}`,
        a("lose") && sentence(a("lose")),
        a("next") && `Дальше это может подхватить вот кто. ${sentence(a("next"))}`,
      ]);
    case "one-photo":
      return prose([
        opening,
        [a("who") && `На фотографии ${sentence(a("who"))}`, a("where") && sentence(a("where"))].filter(Boolean).join(" "),
        a("before") && `Перед щелчком было так. ${sentence(a("before"))}`,
        a("camera") && `Камеру держал не кадр, а человек. ${sentence(a("camera"))}`,
        a("unseen") && `В книге важно и то, чего не видно. ${sentence(a("unseen"))}`,
        a("why") && sentence(a("why")),
      ]);
    default:
      return prose([opening, ...Object.values(answers).map((value) => sentence(value))]);
  }
}
