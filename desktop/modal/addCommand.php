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

$series = $eqLogic->getSeries();
$IO = $eqLogic->getIotaWattStatus(array('inputs' => true, 'outputs' => true));

?>
<div role="tabpanel">
  <div class="tab-content" id="div_displayCmdConfigure" style="overflow-x:hidden">
  <div class="input-group pull-right" style="display:inline-flex">
    <span class="input-group-btn">
      </a><a class="btn btn-success btn-sm roundedRight roundedLeft" id="bt_cmdCreateSave"><i class="fas fa-check-circle"></i> {{Sauvegarder}}</a>
    </span>
  </div>
    <div role="tabpanel" class="tab-pane active" id="cmd_information">
      <br/>
      <div class="row">
        <div class="col-sm-9" >
          <form class="form-horizontal">
            <fieldset>
		      <legend><i class="icon kiko-layers "></i>	{{Series}}</legend>
              <div class="form-group">
                <div class="col-xs-9">
                  <select id="series_id">
                    <option value="">{{Aucun}}</option>
                      <?php
                          if (count($IO['inputs']) > 0)  echo '<optgroup label="{{Entrées}}" id="group"></optgroup>';
                          for ($i = 0; $i < count($IO['inputs']); $i++) {
                              $options = '';
                              $options .= '<option value="' . $series[$i]['name'] . '" data-type="input" data-channel="' . $IO['inputs'][$i]['channel'] . '">' . $series[$i]['name'] . ' > '. $series[$i]['unit'] . '</option>';
                              echo $options;

                          }
                          if (count($IO['outputs']) > 0)  echo '<optgroup label="{{Sorties}}" id="group"></optgroup>';
                          for ($j = 0; $j < count($IO['outputs']); $j++) {
                              $options = '';
                              $options .= '<option value="' . $IO['outputs'][$j]['name'] . '" data-type="output" data-channel="' . $IO['outputs'][$j]['name'] . '">' . $series[$j+$i]['name'] . ' > '. $IO['outputs'][$j]['units'] . '</option>';
                              echo $options;
                          }
                      ?>
				  </select>
                </div>
              </div>
		      <legend><i class="icon kiko-electricity"></i>	{{Tension/Puissance}}</legend>
              <div class="form-group">
                <div class="col-xs-9">
                  <select id="voltPower">
                    <option value="">{{Aucun}}</option>
                    <optgroup label="{{Tension entrée ou sortie}}" id="group"></optgroup>
                    <option value="Volts">{{Tension (V)}}</option>
                    <option value="Hz">{{Fréquence (Hz)}}</option>
                    <optgroup label="{{Puissance entrée ou sortie}}" id="group"></optgroup>
                    <option value="Watts">{{Puissance (W)}}</option>
                    <option value="Amps">{{Intensité (A)}}</option>
                    <option value="Wh">{{Consommation (Wh)}}</option>
                    <option value="VA">{{Puissance active (VA)}}</option>
                    <option value="VAR">{{Puissance réactive (VAr)}}</option>
                    <option value="VARh">{{Énergie réactive (VAhr)}}</option>
                    <option value="PF">{{Facteur de puissance (cos phi)}}</option>
                  </select>
                </div>
              </div>
		      <legend><i class="icon kiko-mathematics"></i>	{{Arrondi}}</legend>
              <div class="form-group">
                <div class="col-xs-9">
                  <select id="roundValue">
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                  </select>
                </div>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </div>
  </div>
</div>

<?php include_file('desktop', 'addCommand', 'js', 'iotawatt'); ?>
