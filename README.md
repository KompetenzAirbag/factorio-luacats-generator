# Factorio API LuaCATS generator
This script will generate LuaCATS-style notations in the specified folder. Since this is plain Lua it can be read by any LSP and used for type completion.

# Requirements
- nodsjs

# Usage
```{bash}
node luaCATS_generator.js
    -v|--version stable|latest|2.0.77|... default: stable
    -o|--output  any existing folder      default: ./factorio-meta
```

## Neovim
If you are using Neovim with `nvim-lspconfig` you can add the folder containing the Factorio meta to your `lua_ls` settings:
```{lua}
lua_ls = {
  settings = {
    Lua = {
      workspace = {
        library = {
          vim.fn.expand("~/<your-path>/factorio-meta/"),
        },
      },
    },
  },
},
```
