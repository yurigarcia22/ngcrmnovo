-- Produto com valor personalizavel: o nome e fixo (ex.: "Assessoria"), mas o
-- preco depende do cliente (1.500, 2.000, 3.000...). Nesse caso o valor e
-- digitado no negocio, na hora de adicionar o produto, e fica em
-- deal_items.unit_price. products.price fica 0 e nao e usado.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS custom_price boolean NOT NULL DEFAULT false;
