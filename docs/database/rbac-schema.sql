-- =============================================================================
-- Laundry Quick — RBAC and branch-wise access schema
-- PostgreSQL 15+ (UNIQUE NULLS NOT DISTINCT). gen_random_uuid() is built in (13+).
-- Single business: no tenant_id.
-- Design notes and ER diagram: rbac-schema.md
-- =============================================================================


-- -----------------------------------------------------------------------------
-- users — people who log in
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name           varchar(150) NOT NULL,
    email          varchar(254) NOT NULL,
    password_hash  varchar(255) NOT NULL,
    is_active      boolean      NOT NULL DEFAULT true,
    created_at     timestamptz  NOT NULL DEFAULT now()
);

-- Email is unique regardless of case (Ali@Shop.com = ali@shop.com).
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));


-- -----------------------------------------------------------------------------
-- branches — shop locations
-- -----------------------------------------------------------------------------
CREATE TABLE branches (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(120) NOT NULL,
    address     text,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX branches_name_lower_uq ON branches (lower(name));


-- -----------------------------------------------------------------------------
-- roles — named bundles of permissions, shared by all branches
-- -----------------------------------------------------------------------------
CREATE TABLE roles (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            varchar(80) NOT NULL,
    description     text,
    is_system_role  boolean     NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX roles_name_lower_uq ON roles (lower(name));

COMMENT ON COLUMN roles.is_system_role IS
    'Shipped with the system (seeded below). The application must not let users delete or rename these.';


-- -----------------------------------------------------------------------------
-- permissions — every action the application checks, e.g. orders.create
-- -----------------------------------------------------------------------------
CREATE TABLE permissions (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    code         varchar(100) NOT NULL,
    module       varchar(50)  NOT NULL,
    description  text,
    CONSTRAINT permissions_code_uq        UNIQUE (code),
    CONSTRAINT permissions_code_format_ck CHECK (code ~ '^[a-z_]+\.[a-z_]+$')  -- module.action
);


-- -----------------------------------------------------------------------------
-- role_permissions — M:N roles <-> permissions
-- -----------------------------------------------------------------------------
CREATE TABLE role_permissions (
    role_id        uuid NOT NULL REFERENCES roles (id)       ON DELETE CASCADE,
    permission_id  uuid NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- PK covers lookups by role_id; this covers "which roles have permission X".
CREATE INDEX role_permissions_permission_idx ON role_permissions (permission_id);


-- -----------------------------------------------------------------------------
-- user_branch_assignments — M:N users <-> branches (which branches a user works in)
-- -----------------------------------------------------------------------------
CREATE TABLE user_branch_assignments (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
    branch_id   uuid        NOT NULL REFERENCES branches (id) ON DELETE RESTRICT,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_branch_assignments_uq UNIQUE (user_id, branch_id)   -- no duplicate assignment
);

-- Unique constraint covers lookups by user_id; this covers "staff of branch X".
CREATE INDEX user_branch_assignments_branch_idx ON user_branch_assignments (branch_id);


-- -----------------------------------------------------------------------------
-- user_roles — M:N users <-> roles, optionally limited to one branch
--   branch_id NULL     → organization-wide role (applies in every branch)
--   branch_id NOT NULL → role applies only in that branch
-- -----------------------------------------------------------------------------
CREATE TABLE user_roles (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
    role_id     uuid        NOT NULL REFERENCES roles (id)    ON DELETE RESTRICT,
    branch_id   uuid        NULL     REFERENCES branches (id) ON DELETE RESTRICT,
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- No duplicate role assignment. NULLS NOT DISTINCT makes this also block
    -- the same organization-wide role twice (plain UNIQUE treats NULLs as different).
    CONSTRAINT user_roles_uq UNIQUE NULLS NOT DISTINCT (user_id, role_id, branch_id),

    -- A branch-restricted role requires the user to be assigned to that branch.
    -- Not checked when branch_id IS NULL (MATCH SIMPLE), so org-wide roles are unaffected.
    -- Removing the assignment removes the user's roles in that branch.
    CONSTRAINT user_roles_branch_assignment_fk
        FOREIGN KEY (user_id, branch_id)
        REFERENCES user_branch_assignments (user_id, branch_id)
        ON DELETE CASCADE
);

-- Unique constraint covers lookups by user_id.
CREATE INDEX user_roles_role_idx   ON user_roles (role_id);
CREATE INDEX user_roles_branch_idx ON user_roles (branch_id) WHERE branch_id IS NOT NULL;

COMMENT ON COLUMN user_roles.branch_id IS
    'NULL = organization-wide role. Otherwise the role applies only in this branch.';


-- =============================================================================
-- Seed data
-- =============================================================================

-- Default roles. All are system roles; roles the owner creates later are not.
INSERT INTO roles (name, description, is_system_role) VALUES
    ('Owner',          'Business owner. Full access to every branch and setting.',          true),
    ('Admin',          'Manages branches, staff and roles across the business.',            true),
    ('Branch Manager', 'Runs a branch: orders, payments, customers and reports.',           true),
    ('Receptionist',   'Front desk: registers customers and takes new orders.',             true),
    ('Cashier',        'Takes payments and hands over ready orders.',                       true),
    ('Laundry Staff',  'Processes garments and updates order status.',                      true),
    ('Delivery Staff', 'Handles pickups and deliveries.',                                   true);

-- Permissions. Codes match what the application checks.
INSERT INTO permissions (code, module, description) VALUES
    ('branches.manage',      'Administration', 'Create, edit and deactivate branches'),
    ('users.manage',         'Administration', 'Create and edit staff accounts and their access'),
    ('roles.manage',         'Administration', 'Create and edit roles and their permissions'),
    ('dashboard.view',       'Dashboard',      'View dashboard'),
    ('orders.view',          'Orders',         'View orders'),
    ('orders.create',        'Orders',         'Create orders'),
    ('orders.edit',          'Orders',         'Edit orders'),
    ('orders.delete',        'Orders',         'Delete orders'),
    ('orders.update_status', 'Orders',         'Mark cleaned, ready and collected'),
    ('payments.take',        'Payments',       'Take payments'),
    ('payments.discount',    'Payments',       'Give discounts'),
    ('payments.refund',      'Payments',       'Issue refunds'),
    ('customers.view',       'Customers',      'View customers'),
    ('customers.create',     'Customers',      'Add customers'),
    ('customers.edit',       'Customers',      'Edit customers'),
    ('customers.delete',     'Customers',      'Delete customers'),
    ('products.view',        'Products',       'View products and prices'),
    ('products.manage',      'Products',       'Add and edit products and prices'),
    ('deliveries.view',      'Deliveries',     'View pickups and deliveries'),
    ('deliveries.update',    'Deliveries',     'Update pickup and delivery status'),
    ('reports.view',         'Reports',        'View reports');

-- Owner and Admin: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Owner', 'Admin');

-- Other default roles: suggested starting set (editable later, except by business rules).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
    ('Branch Manager', ARRAY[
        'dashboard.view',
        'orders.view', 'orders.create', 'orders.edit', 'orders.delete', 'orders.update_status',
        'payments.take', 'payments.discount', 'payments.refund',
        'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
        'products.view', 'deliveries.view', 'reports.view']),
    ('Receptionist', ARRAY[
        'dashboard.view',
        'orders.view', 'orders.create', 'orders.edit',
        'customers.view', 'customers.create', 'customers.edit',
        'products.view', 'payments.take']),
    ('Cashier', ARRAY[
        'dashboard.view',
        'orders.view', 'orders.update_status',
        'payments.take', 'payments.discount',
        'customers.view']),
    ('Laundry Staff', ARRAY[
        'orders.view', 'orders.update_status']),
    ('Delivery Staff', ARRAY[
        'orders.view', 'customers.view', 'deliveries.view', 'deliveries.update'])
) AS m (role_name, codes)
JOIN roles r       ON r.name = m.role_name
JOIN permissions p ON p.code = ANY (m.codes);
