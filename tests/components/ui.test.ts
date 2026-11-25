import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "../../src/components/ui/button";
import { Card, CardContent, CardTitle } from "../../src/components/ui/card";
import { Drawer } from "../../src/components/ui/drawer";
import { Input } from "../../src/components/ui/input";
import { Navbar } from "../../src/components/ui/navbar";
import { StockBadge } from "../../src/components/ui/stock-badge";

test("core controls render their accessible attributes", () => {
  const button = renderToStaticMarkup(
    createElement(Button, { disabled: true }, "Comprar"),
  );
  const dangerButton = renderToStaticMarkup(
    createElement(Button, { variant: "danger" }, "Remover"),
  );
  const input = renderToStaticMarkup(createElement(Input, { "aria-label": "Buscar produtos" }));

  assert.match(button, /disabled=""/);
  assert.match(button, />Comprar<\/button>/);
  assert.match(button, /bg-brand-700/);
  assert.match(dangerButton, /bg-danger-700/);
  assert.match(input, /aria-label="Buscar produtos"/);
});

test("cards and stock badges render catalog content", () => {
  const markup = renderToStaticMarkup(
    createElement(
      Card,
      null,
      createElement(CardTitle, null, "Produto"),
      createElement(CardContent, null, createElement(StockBadge, { stock: 3 })),
    ),
  );
  const unavailable = renderToStaticMarkup(createElement(StockBadge, { stock: 0 }));

  assert.match(markup, /Produto/);
  assert.match(markup, /3 em estoque/);
  assert.match(markup, /bg-success-100/);
  assert.match(unavailable, /Sem estoque/);
  assert.match(unavailable, /bg-danger-100/);
});

test("drawer is controlled and exposes dialog semantics", () => {
  const closed = renderToStaticMarkup(
    createElement(Drawer, {
      open: false,
      onClose() {},
      title: "Carrinho",
      children: "Conteúdo",
    }),
  );
  const open = renderToStaticMarkup(
    createElement(Drawer, {
      open: true,
      onClose() {},
      title: "Carrinho",
      children: "Conteúdo",
    }),
  );

  assert.equal(closed, "");
  assert.match(open, /role="dialog"/);
  assert.match(open, /aria-modal="true"/);
  assert.match(open, /tabindex="-1"/);
  assert.match(open, /Carrinho/);
});

test("navbar links to order history and presents logout", () => {
  const markup = renderToStaticMarkup(createElement(Navbar, { userName: "Ana" }));

  assert.match(markup, /href="\/orders"/);
  assert.match(markup, /Meus Pedidos/);
  assert.match(markup, /Olá, Ana/);
  assert.match(markup, />Sair<\/button>/);
});
