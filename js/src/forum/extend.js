import Extend from 'flarum/common/extenders';
import MapListPage from './pages/MapListPage';
import MapPage from './pages/MapPage';

export default [
  new Extend.Routes()
    .add('chak.maps', '/maps', MapListPage)
    .add('chak.map', '/maps/:id', MapPage),
];
