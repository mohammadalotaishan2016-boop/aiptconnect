import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: { main: '#17a2b8' },
    text: { primary: '#000000', secondary: '#000000' },
    background: { default: '#ffffff', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Times New Roman", Times, serif',
    allVariants: { color: '#000000' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        * { font-family: "Times New Roman", Times, serif; }
        body { color: #000000; background-color: #ffffff; }
      `,
    },
  },
});

export default theme;
