// Hanya path internal yang boleh menjadi tautan kartu (server tidak dipercaya mutlak).

export const isInternalPath = (href: string): boolean => /^\/(?!\/)/.test(href);
