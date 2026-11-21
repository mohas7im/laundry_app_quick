from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('roles', '0001_initial'),
        ('branches', '0001_initial'),
    ]

    operations = [
        # A branch-restricted role requires the user to be assigned to that branch.
        # Not checked when branch_id IS NULL (MATCH SIMPLE): org-wide roles are unaffected.
        # Removing the assignment removes the user's roles in that branch.
        migrations.RunSQL(
            sql="""
                ALTER TABLE user_roles
                ADD CONSTRAINT user_roles_branch_assignment_fk
                FOREIGN KEY (user_id, branch_id)
                REFERENCES user_branch_assignments (user_id, branch_id)
                ON DELETE CASCADE;
            """,
            reverse_sql='ALTER TABLE user_roles DROP CONSTRAINT user_roles_branch_assignment_fk;',
        ),
        # Permissions are loaded per menu in 0003_menus.
    ]
