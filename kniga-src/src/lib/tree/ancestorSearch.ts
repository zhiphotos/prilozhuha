import { yearNum } from "./kinship.ts";

export type Seek = "parents" | "war" | "repression" | "siblings";

export type SearchInput = {
  firstName: string;
  patronymic: string;
  lastName: string;
  birthYear: string;
  deathYear: string;
  place: string;
  seek: Seek;
};

export type Lead = {
  id: string;
  title: string;
  archive: string;
  href: string;
  query: string;
  why: string;
  grade: "A" | "B" | "C";
  seen: boolean;
};

export type SearchCase = {
  question: string;
  query: string;
  variants: string[];
  leads: Lead[];
  letter: string;
  caution: string;
};

type Tag =
  | "metric"
  | "war"
  | "ww1"
  | "repression"
  | "jewish"
  | "poland"
  | "galicia"
  | "ukraine"
  | "belarus"
  | "moldova"
  | "latvia"
  | "lithuania"
  | "estonia"
  | "caucasus"
  | "centralasia"
  | "finland"
  | "german"
  | "moscow"
  | "general";

type Archive = {
  id: string;
  title: string;
  href: string;
  why: string;
  grade: Lead["grade"];
  tags: Tag[];
};

const ARCHIVES: Archive[] = [
  { id: "yandex", title: "Яндекс Архивы", href: "https://yandex.ru/archive", why: "Сканы метрик и ревизских сказок. Расшифровка — наводка, читать надо страницу.", grade: "A", tags: ["metric", "general"] },
  { id: "familysearch", title: "FamilySearch, каталог", href: "https://www.familysearch.org/search/catalog", why: "Неиндексированные сканы метрик. Искать по старому названию места. Вход делает человек.", grade: "A", tags: ["metric", "general", "ukraine", "galicia", "moldova"] },
  { id: "guides", title: "Гид по архивам России", href: "https://guides.rusarchives.ru/guides-list", why: "Какой архив хранит губернию и как называется фонд.", grade: "A", tags: ["metric", "general"] },
  { id: "rgada", title: "РГАДА", href: "https://sic.rgantd.ru/archives/", why: "Ревизские сказки и фонды XVI–XVIII веков.", grade: "A", tags: ["metric"] },
  { id: "rgia", title: "РГИА", href: "https://rgia.su", why: "Служба, дворянство, переселения до революции.", grade: "A", tags: ["metric"] },
  { id: "garf", title: "ГАРФ", href: "https://statearchive.ru", why: "Фонды внутренних дел и учреждений XIX–XX веков.", grade: "A", tags: ["repression", "metric"] },
  { id: "cgamos", title: "Главархив Москвы, метрики", href: "https://cgamos.ru/metric-books/", why: "Метрические книги Москвы.", grade: "A", tags: ["metric", "moscow"] },
  { id: "pamyat", title: "Память народа", href: "https://pamyat-naroda.ru/", why: "Потери, награды и боевой путь. Часто стоит капча — её проходит человек.", grade: "A", tags: ["war"] },
  { id: "memorial", title: "ОБД «Мемориал»", href: "https://obd-memorial.ru/html/", why: "Донесения о потерях. Смотреть скан и место рождения, не только фамилию.", grade: "A", tags: ["war"] },
  { id: "podvig", title: "Подвиг народа", href: "http://podvignaroda.ru/?#tab=navPeople_search", why: "Наградные листы. Место призыва часто называет село.", grade: "A", tags: ["war"] },
  { id: "gwar", title: "Памяти героев, 1914–1918", href: "https://gwar.mil.ru/", why: "Первая мировая: карточки и образы документов.", grade: "A", tags: ["ww1"] },
  { id: "doroga", title: "Дорога памяти", href: "https://1418museum.ru/", why: "Сводный поиск участников войны.", grade: "B", tags: ["war"] },
  { id: "openlist", title: "Открытый список", href: "https://ru.openlist.wiki/", why: "Указатель репрессированных. В карточке нужна архивная ссылка.", grade: "B", tags: ["repression"] },
  { id: "openlist-ua", title: "Відкритий список", href: "https://ua.openlist.wiki/", why: "Украинский указатель репрессированных, покрытие другое.", grade: "B", tags: ["repression", "ukraine"] },
  { id: "visz", title: "Возвращённые имена", href: "http://visz.nlr.ru/", why: "Мемориальный указатель Российской национальной библиотеки.", grade: "B", tags: ["repression"] },
  { id: "barak", title: "Бессмертный барак", href: "https://bessmertnybarak.ru/pamyatnik/", why: "Память о репрессированных. Проверять, откуда взята строка.", grade: "C", tags: ["repression"] },
  { id: "tsdial", title: "ЦДІАЛ, Львов", href: "https://tsdial.archives.gov.ua", why: "Метрики Галиции: греко-католические и римо-католические приходы.", grade: "A", tags: ["metric", "galicia", "ukraine"] },
  { id: "tsdiak", title: "ЦДІАК, Киев", href: "https://tsdia.archives.gov.ua", why: "Метрики Правобережной Украины.", grade: "A", tags: ["metric", "ukraine"] },
  { id: "archives-ua", title: "Архивы Украины", href: "https://archives.gov.ua", why: "Какой областной архив хранит это место.", grade: "A", tags: ["metric", "ukraine"] },
  { id: "duck", title: "Качиний інспектор", href: "https://inspector.duckarchive.com/", why: "Шифр украинского дела к скану на FamilySearch.", grade: "B", tags: ["metric", "ukraine"] },
  { id: "bukovyna", title: "Нескорена Буковина", href: "https://neskorena-bukovyna.com.ua/", why: "Списки выселенных и реабилитации по Буковине, с шифрами.", grade: "B", tags: ["repression", "ukraine", "galicia"] },
  { id: "niab", title: "Исторический архив Беларуси", href: "https://niab.by/newsite/", why: "Метрики и ревизские сказки до революции.", grade: "A", tags: ["metric", "belarus"] },
  { id: "partizany", title: "Партизаны Беларуси", href: "https://partizany.by/", why: "Карточки партизан. Сохранять происхождение записи.", grade: "B", tags: ["war", "belarus"] },
  { id: "moldova", title: "Национальный архив Молдовы", href: "https://arhiva.gov.md", why: "Метрики Бессарабии 1820–1924.", grade: "A", tags: ["metric", "moldova"] },
  { id: "raduraksti", title: "Raduraksti", href: "https://raduraksti.arhivi.lv", why: "Церковные книги и ревизии Латвии.", grade: "A", tags: ["metric", "latvia"] },
  { id: "epaveldas", title: "ePaveldas", href: "https://www.epaveldas.lt", why: "Метрики Литвы. Указателя по именам нет, смотреть приход.", grade: "A", tags: ["metric", "lithuania"] },
  { id: "saaga", title: "Saaga, архив Эстонии", href: "https://www.ra.ee/dgs/explorer.php", why: "Церковные книги и ревизии Эстонии.", grade: "A", tags: ["metric", "estonia"] },
  { id: "geneteka", title: "Geneteka", href: "https://geneteka.genealodzy.pl", why: "Индекс метрик Польши, Литвы, Беларуси и западной Украины. Индекс сверять с книгой.", grade: "B", tags: ["metric", "poland", "galicia", "belarus", "lithuania"] },
  { id: "szukaj", title: "Szukaj w Archiwach", href: "https://szukajwarchiwach.gov.pl", why: "Сканы польских госархивов, в том числе метрики.", grade: "A", tags: ["metric", "poland"] },
  { id: "agad", title: "AGAD, Варшава", href: "https://agad.gov.pl", why: "Фонды восточных земель Речи Посполитой и Галиции.", grade: "A", tags: ["metric", "poland", "galicia"] },
  { id: "matricula", title: "Matricula", href: "https://data.matricula-online.eu/en/", why: "Приходские книги Австрии и части Польши.", grade: "A", tags: ["metric", "galicia", "poland"] },
  { id: "verlust", title: "Verlustlisten, 1914–1919", href: "https://des.genealogy.net/ou1wk/search", why: "Списки потерь австро-венгерской армии: село, полк, год.", grade: "B", tags: ["ww1", "galicia", "german"] },
  { id: "oesta", title: "Архив Австрии", href: "https://www.oesta.gv.at", why: "Военные формуляры Габсбургов.", grade: "A", tags: ["ww1", "galicia"] },
  { id: "jewishgen", title: "JewishGen", href: "https://www.jewishgen.org", why: "Базы и указатель местечек. Совпадение фамилии — наводка.", grade: "B", tags: ["jewish", "metric"] },
  { id: "jri", title: "JRI-Poland", href: "https://jri-poland.org", why: "Индексы еврейских метрик польских архивов.", grade: "B", tags: ["jewish", "poland"] },
  { id: "yadvashem", title: "Яд Вашем", href: "https://www.yadvashem.org", why: "База жертв Шоа и страницы свидетельств. Это рассказ составителя, его надо сверять.", grade: "B", tags: ["jewish", "war"] },
  { id: "rtr", title: "Routes to Roots", href: "https://rtrfoundation.com", why: "Какие книги местечка уцелели и в каком архиве лежат.", grade: "B", tags: ["jewish", "ukraine", "belarus", "moldova", "lithuania", "poland"] },
  { id: "winter", title: "Финская война, Карелия", href: "https://winterwar.karelia.ru/", why: "База советско-финской войны.", grade: "B", tags: ["war", "finland"] },
  { id: "wolgadeutsche", title: "Wolgadeutsche", href: "https://wolgadeutsche.net/", why: "Немцы Поволжья. Проверять, на какой документ ссылается страница.", grade: "B", tags: ["german", "metric"] },
  { id: "perm", title: "Поколения Пермского края", href: "https://pokolenia.permkrai.ru/", why: "Региональный поиск по Перми.", grade: "B", tags: ["metric"] },
  { id: "vyatka", title: "Родная Вятка", href: "http://rodnaya-vyatka.ru/", why: "Краеведческий указатель Вятки.", grade: "B", tags: ["metric"] },
  { id: "bash", title: "Архивы Башкортостана", href: "https://basharchive.ru/", why: "Каталог архивов Башкортостана.", grade: "A", tags: ["metric"] },
];

const SEEKS: Record<Seek, string> = {
  parents: "родителей",
  war: "службу и военные документы",
  repression: "след репрессий или высылки",
  siblings: "братьев и сестёр",
};

export function nameVariants(lastName: string, firstName: string, patronymic: string): string[] {
  const last = lastName.trim();
  const first = firstName.trim();
  const middle = patronymic.trim();
  const full = [last, first, middle].filter(Boolean).join(" ");
  const short = [last, first].filter(Boolean).join(" ");
  const list = [full, short, last].filter(Boolean);
  if (/[ая]$/i.test(last) && last.length > 3) list.push(`${last.slice(0, -1)} (мужская форма фамилии, если ищете отца)`);
  return [...new Set(list)];
}

function placeTags(place: string): Tag[] {
  const tags: Tag[] = [];
  const has = (words: string[]) => words.some((word) => place.includes(word));
  if (has(["москв"])) tags.push("moscow");
  if (has(["украин", "киев", "львов", "харьк", "одесс", "полтав", "житом", "волын", "подоль", "черниг", "днепр", "винниц"])) tags.push("ukraine");
  if (has(["галиц", "львов", "буковин", "тернопол", "ивано-франк", "станислав"])) tags.push("galicia", "ukraine");
  if (has(["беларус", "белорус", "минск", "гродн", "витеб", "могил"])) tags.push("belarus");
  if (has(["молдов", "кишин", "бессараб"])) tags.push("moldova");
  if (has(["латви", "рига", "лиепа", "курлянд", "лифлянд"])) tags.push("latvia");
  if (has(["литв", "вильн", "ковен"])) tags.push("lithuania");
  if (has(["эстон", "ревэл", "тарту", "юрьев"])) tags.push("estonia");
  if (has(["польш", "варшав", "краков", "люблин"])) tags.push("poland");
  if (has(["грузи", "армян", "азербайдж", "тифлис", "баку", "ереван", "кавказ"])) tags.push("caucasus");
  if (has(["казах", "узбек", "ташкент", "киргиз", "таджик", "туркмен", "самарканд"])) tags.push("centralasia");
  if (has(["финлянд", "карел", "выборг"])) tags.push("finland");
  if (has(["немец", "поволж", "прус", "герман"])) tags.push("german");
  if (has(["евре", "иуде", "местеч"])) tags.push("jewish");
  return tags;
}

export function pickArchives(input: SearchInput): Lead[] {
  const place = input.place.toLowerCase();
  const born = yearNum(input.birthYear);
  const tags = new Set<Tag>(["general"]);
  if (input.seek === "parents" || input.seek === "siblings") tags.add("metric");
  if (input.seek === "repression") tags.add("repression");
  if (input.seek === "war" || (born >= 1885 && born <= 1927)) tags.add("war");
  if (born !== 9999 && born >= 1870 && born <= 1900) tags.add("ww1");
  for (const tag of placeTags(place)) tags.add(tag);
  const query = nameVariants(input.lastName, input.firstName, input.patronymic)[0] || "фамилия";
  const local = placeTags(place);
  const rank = (archive: Archive) => {
    let score = archive.grade === "A" ? 1 : 0;
    if (archive.tags.some((tag) => local.includes(tag))) score += 5;
    if (tags.has("war") && archive.tags.includes("war")) score += input.seek === "war" ? 5 : 3;
    if (tags.has("ww1") && archive.tags.includes("ww1")) score += 2;
    if (input.seek === "repression" && archive.tags.includes("repression")) score += 3;
    if ((input.seek === "parents" || input.seek === "siblings") && archive.tags.includes("metric")) score += 2;
    return score;
  };
  return ARCHIVES.filter((archive) => archive.tags.some((tag) => tags.has(tag)))
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, 12)
    .map((archive) => ({
      id: archive.id,
      title: archive.title,
      archive: archive.title,
      href: archive.href,
      query,
      why: archive.why,
      grade: archive.grade,
      seen: false,
    }));
}

export function buildCase(input: SearchInput): SearchCase {
  const name = [input.lastName, input.firstName, input.patronymic].map((part) => part.trim()).filter(Boolean).join(" ") || "этого человека";
  const born = yearNum(input.birthYear);
  const when = born === 9999 ? "год рождения не указан" : `около ${born}`;
  const where = input.place.trim() ? input.place.trim() : "место не указано";
  const variants = nameVariants(input.lastName, input.firstName, input.patronymic);
  const query = variants[0] || name;
  const leads = pickArchives(input);
  const letter = [
    "Прошу проверить, есть ли запись.",
    `Кого ищем: ${name}.`,
    `Годы: ${when}${input.deathYear.trim() ? `, смерть ${input.deathYear.trim()}` : ""}.`,
    `Место: ${where}.`,
    `Нужно: ${SEEKS[input.seek]}.`,
    "Прошу указать шифр дела и можно ли посмотреть скан. Пустой поиск по сайту ещё не ответ.",
  ].join("\n");
  return {
    question: `Ищем ${SEEKS[input.seek]} — ${name}, ${when}, ${where}.`,
    query,
    variants,
    leads,
    letter,
    caution: "Наводка — не родственник. Одинаковая фамилия и даже то же село ещё ничего не доказывают. В древо человек попадает только как гипотеза, пока запись одна.",
  };
}

export const archiveCatalog = ARCHIVES;
