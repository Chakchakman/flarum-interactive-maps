<?php
require __DIR__.'/../src/Models/EmbedPresentation.php';
use ChakChakman\InteractiveMaps\Models\EmbedPresentation;
foreach ([[], ['displayPosition' => 'above'], ['displayPosition' => 'below', 'startsCollapsed' => false], ['startsCollapsed' => true]] as $value) {
    if (!EmbedPresentation::valid($value)) throw new LogicException('Valid presentation rejected');
}
foreach ([['displayPosition' => 'before'], ['displayPosition' => null], ['startsCollapsed' => 'false'], ['startsCollapsed' => 0], ['startsCollapsed' => null]] as $value) {
    if (EmbedPresentation::valid($value)) throw new LogicException('Invalid presentation accepted');
}
if (EmbedPresentation::values([]) !== ['display_position' => 'below', 'starts_collapsed' => false]) throw new LogicException('Legacy defaults changed');
echo "PASS: strict per-embed presentation validation and legacy defaults\n";
