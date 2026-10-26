import type { Person, TreeData, Union } from "./types.ts";

function p(
  id: string,
  firstName: string,
  patronymic: string,
  lastName: string,
  gender: Person["gender"],
  birthYear: string,
  deathYear = "",
  note = "",
): Person {
  return {
    id,
    firstName,
    patronymic,
    lastName,
    gender,
    birthYear,
    deathYear,
    photo: `/portraits/${id}.jpg`,
    note,
  };
}

function u(
  id: string,
  partnerIds: string[],
  childIds: string[],
  status: Union["status"],
  startYear = "",
  endYear = "",
): Union {
  return { id, partnerIds, childIds, status, startYear, endYear };
}

export function demoTree(): TreeData {
  const people: Person[] = [
    p("ustinya", "Устинья", "Савельевна", "Лапина", "f", "1830", "1904", "Хранительница дома в шестом колене."),
    p("egor", "Егор", "Кузьмич", "Лапин", "m", "1826", "1891"),
    p("marfa", "Марфа", "Егоровна", "Кольцова", "f", "1854", "1934"),
    p("pyotr", "Пётр", "Ильич", "Кольцов", "m", "1849", "1912"),
    p("agrafena", "Аграфена", "Петровна", "Белова", "f", "1879", "1961"),
    p("fedor", "Фёдор", "Степанович", "Белов", "m", "1874", "1942"),
    p("elena", "Елена", "Фёдоровна", "Морозова", "f", "1904", "1990", "Пережила мужа на двенадцать лет."),
    p("ivan", "Иван", "Сергеевич", "Морозов", "m", "1899", "1978"),
    p("sergei", "Сергей", "Иванович", "Морозов", "m", "1929", "2008"),
    p("valentina", "Валентина", "Орлова", "", "f", "1931", "2012", "Первый брак Сергея, расторгнут."),
    p("nina", "Нина", "Павловна", "Морозова", "f", "1933", "2019"),
    p("igor", "Игорь", "Сергеевич", "Морозов", "m", "1952", "", "Сын от первого брака деда."),
    p("olga", "Ольга", "Сергеевна", "Волкова", "f", "1957"),
    p("pavel", "Павел", "Сергеевич", "Морозов", "m", "1960"),
    p("viktor", "Виктор", "Андреевич", "Волков", "m", "1953"),
    p("dmitry", "Дмитрий", "Викторович", "Волков", "m", "1986"),
    p("alina", "Алина", "Сергеевна", "Волкова", "f", "1988", "", "Брак с Дмитрием расторгнут."),
    p("anna", "Анна", "Викторовна", "Волкова", "f", "1992", "", "От неё считается родство в этом древе."),
    p("kirill", "Кирилл", "Леонидович", "Соколов", "m", "1990"),
    p("ekaterina", "Екатерина", "Викторовна", "Волкова", "f", "1996"),
    p("artem", "Артём", "Игоревич", "Белых", "m", "1994"),
    p("ilya", "Илья", "Викторович", "Волков", "m", "2000"),
    p("mikhail", "Михаил", "Дмитриевич", "Волков", "m", "2015"),
    p("lev", "Лев", "Кириллович", "Соколов", "m", "2017"),
    p("sofia", "Софья", "Кирилловна", "Соколова", "f", "2020"),
    p("polina", "Полина", "Артёмовна", "Белых", "f", "2021"),
  ];

  const unions: Union[] = [
    u("u-lapin", ["egor", "ustinya"], ["marfa"], "married", "1851", "1891"),
    u("u-kolcov", ["pyotr", "marfa"], ["agrafena"], "married", "1876", "1912"),
    u("u-belov", ["fedor", "agrafena"], ["elena"], "married", "1901", "1942"),
    u("u-morozov", ["ivan", "elena"], ["sergei"], "widowed", "1926", "1978"),
    u("u-val", ["sergei", "valentina"], ["igor"], "divorced", "1951", "1955"),
    u("u-nina", ["sergei", "nina"], ["olga", "pavel"], "married", "1956", "2008"),
    u("u-volkov", ["viktor", "olga"], ["dmitry", "anna", "ekaterina", "ilya"], "married", "1984"),
    u("u-alina", ["dmitry", "alina"], ["mikhail"], "divorced", "2012", "2019"),
    u("u-anna", ["kirill", "anna"], ["lev", "sofia"], "married", "2015"),
    u("u-katya", ["artem", "ekaterina"], ["polina"], "married", "2018"),
  ];

  return { people, unions, focusId: "anna" };
}

export function blankTree(): TreeData {
  const self: Person = {
    id: "self",
    firstName: "Имя",
    patronymic: "",
    lastName: "Фамилия",
    gender: "u",
    birthYear: "",
    deathYear: "",
    photo: "",
    note: "",
  };
  return { people: [self], unions: [], focusId: self.id };
}
