// Всплывающие сообщения в тестах не нужны.
const fn = () => "id";
export const toast = Object.assign(fn, { success: fn, error: fn, loading: fn, dismiss: fn, message: fn });
export const Toaster = () => null;
