export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export type ButtonBuilder = (
  label: string,
  action: string,
  value?: string,
  classes?: string,
  disabled?: boolean,
) => string;
