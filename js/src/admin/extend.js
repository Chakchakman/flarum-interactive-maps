import Extend from 'flarum/common/extenders';

export default [
  new Extend.Admin().permission(
    () => ({
      icon: 'fas fa-map-marked-alt',
      label: 'Управлять игровыми картами (каталог, фишки, настройки)',
      permission: 'chakchakman-interactive-maps.map.manage',
      tagScoped: false,
    }),
    'moderate',
    95
  ),
  new Extend.Admin().permission(
    () => ({
      icon: 'fas fa-link',
      label: 'Прикреплять игровые карты к сообщениям',
      permission: 'chakchakman-interactive-maps.map.embed',
      tagScoped: false,
    }),
    'moderate',
    94
  ),
];
