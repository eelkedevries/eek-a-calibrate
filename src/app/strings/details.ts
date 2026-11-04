// The Details sheet frame (design §2.17, §4.7): header, tabs, pager and footer. The tabs'
// contents arrive with prompt 017 (strings/details-*.ts).

export const strings: Readonly<Record<string, string>> = {
  'details.title': 'Details',
  'details.done': 'Done',
  'details.tabs': 'Details sections',
  'details.tab.results': 'Results',
  'details.tab.settings': 'Settings',
  'details.tab.data': 'Data',
  'details.tab.device': 'Device',
  'details.tab.about': 'About',
  'details.pages': 'Pages',
  'details.page.prev': 'Previous page',
  'details.page.next': 'Next page',
  'details.page.position': '{page} of {pages}',
  'details.placeholder': 'This section is not built yet.',
  'details.placeholder.results': 'Open the current results page',
  'details.placeholder.data': 'Open the current data page',
  'details.placeholder.device': 'Open diagnostics',
  'details.placeholder.about': 'Open the current About page',
  'details.version': 'Version {version} · {commit}',
  'details.delete': 'Delete all my data',
  'details.delete.title': 'Delete all your data?',
  'details.delete.body': 'This removes every warm-up, profile and session that eek-a-calibrate has stored on this device.',
  'details.delete.confirm': 'Delete',
  'details.delete.cancel': 'Cancel',
  'details.deleted': 'All data that eek-a-calibrate stored on this device has been deleted.',
};
