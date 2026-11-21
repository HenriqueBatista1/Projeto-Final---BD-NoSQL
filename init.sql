CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    external_product_id INT NOT NULL UNIQUE,
    quantity INT NOT NULL CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    payment_method VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PAGO' CHECK (status IN ('PAGO')),
    delivery_address TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    external_product_id INT NOT NULL REFERENCES inventory(external_product_id) ON DELETE RESTRICT,
    product_title VARCHAR(255) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_logs (
    id SERIAL PRIMARY KEY,
    external_product_id INT NOT NULL REFERENCES inventory(external_product_id) ON DELETE RESTRICT,
    old_quantity INT NOT NULL,
    new_quantity INT NOT NULL,
    change_amount INT NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_product_id ON inventory_logs(external_product_id);

CREATE OR REPLACE FUNCTION fn_audit_inventory_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO inventory_logs (external_product_id, old_quantity, new_quantity, change_amount)
        VALUES (NEW.external_product_id, 0, NEW.quantity, NEW.quantity);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE' AND OLD.quantity IS DISTINCT FROM NEW.quantity) THEN
        INSERT INTO inventory_logs (external_product_id, old_quantity, new_quantity, change_amount)
        VALUES (NEW.external_product_id, OLD.quantity, NEW.quantity, NEW.quantity - OLD.quantity);
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_inventory ON inventory;

CREATE TRIGGER trg_audit_inventory
AFTER INSERT OR UPDATE OF quantity ON inventory
FOR EACH ROW
EXECUTE FUNCTION fn_audit_inventory_changes();
