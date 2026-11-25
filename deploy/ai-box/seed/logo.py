import base64
from company.models import CompanySettings
c = CompanySettings.current()
c.logo = 'data:image/png;base64,' + base64.b64encode(open('/seed/comfort-logo.png', 'rb').read()).decode()
c.save(); print('receipt logo updated')
