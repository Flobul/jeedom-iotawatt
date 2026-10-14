<?php
/* This file is part of Jeedom.
*
* Jeedom is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* Jeedom is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
*/


if (!isConnect('admin')) {
    throw new Exception(__('401 - Accès non autorisé', __FILE__));
}
if (init('eqLogic_id') == '') {
    throw new Exception(__('L\'id de l\'équipement ne peut être vide', __FILE__) . ' : ' . init('eqLogic_id'));
}
$eqLogic = eqLogic::byId(init('eqLogic_id'));
if (!is_object($eqLogic)) {
    throw new Exception(__('Aucun équipement associé à l\'id', __FILE__) . ' : ' . init('eqLogic_id'));
}
$path = 'plugins/iotawatt/core/data/';
$file = 'config.txt';
$config = $eqLogic->request('/' . $file);
$old = json_decode(file_get_contents($path . $file), TRUE);

function arrayDiffRecursive(array $firstArray,array  $secondArray, bool $reverse = false): array 
{
    $first = 'old';
    $second = 'new';
    if ($reverse) {
        $first = 'new';
        $second = 'old';
    }
    $diff = [];
    foreach ($firstArray as $k => $value) {
        if (!is_array($value)) {
            if (!array_key_exists($k, $secondArray) || $secondArray[$k] != $value) {
                $diff[$first][$k] = $value;
                $diff[$second][$k] = $secondArray[$k] ?? null;
            }
            continue;
        }
        if (!array_key_exists($k, $secondArray) || !is_array($secondArray[$k])) {
            $diff[$first][$k] = $value;
            $diff[$second][$k] = $secondArray[$k] ?? null;
            continue;
        }
        $newDiff = arrayDiffRecursive($value, $secondArray[$k], $reverse);
        if (!empty($newDiff)) {
            $diff[$first][$k] = $newDiff[$first];
            $diff[$second][$k] = $newDiff[$second];
        }
    }
    return $diff;
}

?>
<div role="tabpanel">
  <div class="tab-content" id="div_displayBackup" style="overflow-x:hidden">
  <div class="input-group pull-right" style="display:inline-flex">
    <span class="input-group-btn">
      </a><a class="btn btn-success btn-sm roundedRight roundedLeft" id="bt_cmdCreateSave"><i class="fas fa-check-circle"></i> {{Sauvegarder}}</a>
    </span>
  </div>
    <?php 
      $update = false;
      if (is_array($config) && $config['device']) {
          if (is_array($old) && $old['device']) {
              $diff = arrayDiffRecursive($old, $config);
              if (count($diff) > 0) {
                  if (isset($diff['new'])) {
                      echo '<span class="label label-warning">{{Valeurs changées, fichier mis à jour.}}</span>';
                      echo '<pre class="configTxt">' . json_encode($diff['new'], JSON_PRETTY_PRINT) . '</pre>';
                      $update = true;
                  }
              } else {
                  echo '<span class="label label-info">{{Fichier déjà à jour.}}</span>';
              }
          } else {
              echo '<span class="label label-success">{{Fichier}} ' . $path . $file . ' {{ inexistant, il vient d\'être ajouté.}}</span>';
              echo '<pre class="configTxt">' . json_encode($config, JSON_PRETTY_PRINT) . '</pre>';
              $update = true;
          }
      }
      if ($update) {
          if (!is_dir($path)){   
              mkdir($path, 0700);
          }
          file_put_contents($path . $file, json_encode($config, JSON_PRETTY_PRINT));
      }
    ?>
  </div>
</div>