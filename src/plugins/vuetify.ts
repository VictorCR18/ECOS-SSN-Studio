// src/plugins/vuetify.ts
//
// Tema customizado "blueprint de rede de suprimentos": paleta baseada em
// azul-petróleo profundo (estrutura/engenharia) e latão/âmbar (fluxo), para
// fugir da paleta padrão roxo/azul do Material Design usada pelo Vuetify
// "de fábrica". As cores semânticas da própria notação SSN (ator por tipo)
// ficam isoladas em services/graph/shapes.ts e não usam este tema.

import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import { createVuetify, type ThemeDefinition } from "vuetify";

const ecosLight: ThemeDefinition = {
  dark: false,
  colors: {
    background: "#F4F6F5",
    surface: "#FFFFFF",
    "surface-variant": "#E7ECEA",
    primary: "#1B4D6B",
    "primary-darken-1": "#123449",
    secondary: "#C98A2C",
    "secondary-darken-1": "#A06E1F",
    error: "#B3261E",
    warning: "#C98A2C",
    info: "#2F6FA3",
    success: "#2E7D4F",
    "on-background": "#1B2226",
    "on-surface": "#1B2226",
  },
  variables: {
    "border-color": "#D7DEDC",
  },
};

const ecosDark: ThemeDefinition = {
  dark: true,
  colors: {
    background: "#0F1B22",
    surface: "#152530",
    "surface-variant": "#1D323F",
    primary: "#5B9BC7",
    "primary-darken-1": "#3E7CA6",
    secondary: "#E3A94A",
    "secondary-darken-1": "#C98A2C",
    error: "#E5847C",
    warning: "#E3A94A",
    info: "#7CB6E0",
    success: "#6FBE8F",
    "on-background": "#E7EEF2",
    "on-surface": "#E7EEF2",
  },
  variables: {
    "border-color": "#28404E",
  },
};

export default createVuetify({
  theme: {
    defaultTheme: "ecosLight",
    themes: { ecosLight, ecosDark },
  },
  defaults: {
    VBtn: { rounded: "lg" },
    VCard: { rounded: "lg" },
    VTextField: { variant: "outlined", density: "comfortable" },
    VTextarea: { variant: "outlined", density: "comfortable" },
    VSelect: { variant: "outlined", density: "comfortable" },
  },
});
