import { privacySectionIds } from "./public-navigation.js";

export function jumpToPrivacySection(id, { doc = document, navigation = history } = {}) {
  if (!privacySectionIds.includes(id)) return false;
  const section = doc.getElementById(id);
  if (!section) return false;
  navigation.replaceState(null, "", "#politica-privacidad");
  section.tabIndex = -1;
  section.scrollIntoView({ block: "start", behavior: "auto" });
  section.focus({ preventScroll: true });
  return true;
}
