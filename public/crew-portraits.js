(function (root, factory) {
  const library = factory();
  if (typeof module === 'object' && module.exports) module.exports = library;
  else root.CrewPortraits = library;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const names = [
    'Marcus Webb', 'Destiny Okafor', 'Ray Kowalski', 'Priya Nair',
    'Darnell Hughes', 'Brianna Solis', 'Tyler Beaumont', 'Amara Diallo',
    'Jorge Medina', 'Quinn Abernathy', 'Danny Kowalczyk', 'Keisha Tremblay',
    'Walt Garside', 'Fatima Al-Rashid', 'Bo Hendricks', 'Sandra Okonkwo',
    'Frank Delucci', 'Yolanda Ferris', 'Dennis Holt', 'Ruth Callahan', 'Gord Beaulieu',
  ];
  // Selected editions include later EMS portrait revisions.
  const editions = {
    'Priya Nair': '-v5', 'Darnell Hughes': '-v13',
    'Fatima Al-Rashid': '-v6', 'Sandra Okonkwo': '-v16',
    'Yolanda Ferris': '-v4',
  };
  function find(member) {
    if (!member) return null;
    if (member.custom) {
      const role = String(member.role || '').startsWith('captain') ? 'captain' : 'partner';
      return '/images/crew/custom-' + role + '-v4-ems.webp';
    }
    const name = String(member.name || '').replace(/^Captain /, '');
    return names.includes(name)
      ? '/images/crew/' + name.toLowerCase().replaceAll(' ', '-') + (editions[name] ?? '-v2') + '-ems.webp'
      : null;
  }
  return { names, find };
});
