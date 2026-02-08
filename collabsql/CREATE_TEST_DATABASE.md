# Create Test Database

Here are several ways to create a test SQLite database for CollabSQL:

## Method 1: Python Script (Recommended)

Create a file `create_test_db.py`:

```python
import sqlite3

# Connect to database (creates file if doesn't exist)
conn = sqlite3.connect('sample_ecommerce.db')
cursor = conn.cursor()

# Create customers table
cursor.execute('''
CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
''')

# Create products table
cursor.execute('''
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    category TEXT
)
''')

# Create orders table
cursor.execute('''
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_amount REAL NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
)
''')

# Insert sample customers
customers = [
    ('John Doe', 'john@example.com', '555-0101'),
    ('Jane Smith', 'jane@example.com', '555-0102'),
    ('Bob Johnson', 'bob@example.com', '555-0103'),
    ('Alice Williams', 'alice@example.com', '555-0104'),
    ('Charlie Brown', 'charlie@example.com', '555-0105'),
]

cursor.executemany(
    'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
    customers
)

# Insert sample products
products = [
    ('Laptop', '15-inch laptop with 16GB RAM', 999.99, 50, 'Electronics'),
    ('Mouse', 'Wireless optical mouse', 29.99, 200, 'Electronics'),
    ('Keyboard', 'Mechanical gaming keyboard', 149.99, 100, 'Electronics'),
    ('Monitor', '27-inch 4K display', 449.99, 30, 'Electronics'),
    ('Headphones', 'Noise-cancelling headphones', 199.99, 75, 'Electronics'),
    ('Desk', 'Standing desk adjustable', 599.99, 20, 'Furniture'),
    ('Chair', 'Ergonomic office chair', 399.99, 40, 'Furniture'),
    ('Notebook', 'Spiral notebook 200 pages', 5.99, 500, 'Stationery'),
    ('Pen Set', 'Ballpoint pens pack of 10', 9.99, 300, 'Stationery'),
    ('USB Cable', 'USB-C to USB-A cable 6ft', 12.99, 150, 'Electronics'),
]

cursor.executemany(
    'INSERT INTO products (name, description, price, stock, category) VALUES (?, ?, ?, ?, ?)',
    products
)

# Insert sample orders
orders = [
    (1, 1, 1, 999.99, 'completed'),
    (1, 2, 2, 59.98, 'completed'),
    (2, 3, 1, 149.99, 'shipped'),
    (3, 4, 1, 449.99, 'pending'),
    (4, 5, 1, 199.99, 'completed'),
    (5, 1, 2, 1999.98, 'processing'),
    (2, 6, 1, 599.99, 'completed'),
    (3, 7, 1, 399.99, 'shipped'),
]

cursor.executemany(
    '''INSERT INTO orders (customer_id, product_id, quantity, total_amount, status)
       VALUES (?, ?, ?, ?, ?)''',
    orders
)

# Create indexes
cursor.execute('CREATE INDEX idx_customers_email ON customers(email)')
cursor.execute('CREATE INDEX idx_orders_customer ON orders(customer_id)')
cursor.execute('CREATE INDEX idx_orders_status ON orders(status)')

# Create view
cursor.execute('''
CREATE VIEW order_summary AS
SELECT
    o.id as order_id,
    c.name as customer_name,
    c.email as customer_email,
    p.name as product_name,
    o.quantity,
    o.total_amount,
    o.status,
    o.order_date
FROM orders o
JOIN customers c ON o.customer_id = c.id
JOIN products p ON o.product_id = p.id
''')

conn.commit()

# Print summary
print("✓ Database created: sample_ecommerce.db")
print(f"✓ Customers: {len(customers)}")
print(f"✓ Products: {len(products)}")
print(f"✓ Orders: {len(orders)}")
print("\nTables created:")
print("  - customers (5 records)")
print("  - products (10 records)")
print("  - orders (8 records)")
print("\nViews created:")
print("  - order_summary")
print("\nYou can now upload this database to CollabSQL!")

conn.close()
```

Run:
```bash
python create_test_db.py
```

## Method 2: Using SQLite CLI

```bash
# Open SQLite
sqlite3 test.db

# Create table
CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    department TEXT,
    salary REAL,
    hire_date DATE
);

# Insert data
INSERT INTO employees (name, department, salary, hire_date) VALUES
('Alice Johnson', 'Engineering', 95000, '2020-01-15'),
('Bob Smith', 'Marketing', 65000, '2019-03-20'),
('Charlie Davis', 'Engineering', 88000, '2021-06-01'),
('Diana Wilson', 'HR', 72000, '2018-09-10'),
('Eve Martinez', 'Sales', 78000, '2020-11-25');

# Exit
.quit
```

## Method 3: DB Browser for SQLite (GUI)

1. Download from https://sqlitebrowser.org/
2. File → New Database
3. Add tables using the visual interface
4. Insert data manually or import from CSV
5. Save and upload to CollabSQL

## Test Queries to Try

Once uploaded, try these natural language queries:

```
"Show all tables"
"How many customers do we have?"
"Get all products in Electronics category"
"Show me completed orders"
"What is the total revenue?"
"List customers who placed orders"
"Show products with low stock"
"Get all orders from last month"
"Show customer with email john@example.com"
"Update product price where id is 1"
```

## Sample Data Sets

You can also download sample databases:

1. **Chinook Database** (Music store)
   - https://github.com/lerocha/chinook-database
   - Download chinook.db

2. **Northwind Database** (Trading company)
   - https://github.com/jpwhite3/northwind-SQLite3
   - Download Northwind_large.sqlite

3. **Create your own**
   - Use the Python script above as a template
   - Modify tables and data for your use case

## Important Notes

- Maximum file size: 50MB
- Supported formats: .db, .sqlite, .sqlite3
- UTF-8 encoding recommended
- Avoid special characters in table/column names

After creating your database, upload it through the CollabSQL dashboard and start querying with natural language!
