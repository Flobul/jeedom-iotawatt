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

require_once __DIR__ . "/../../../../plugins/iotawatt/core/class/iotawatt.display.php";

if (!isConnect('admin')) {
    throw new Exception(__('401 - Accès non autorisé', __FILE__));
}
$plugin = plugin::byId('iotawatt');
sendVarToJS('eqType', $plugin->getId());
$eqLogics = eqLogic::byType($plugin->getId());

?>
<link rel="stylesheet" href="/plugins/iotawatt/desktop/css/iotawatt.css">

<div class="row row-overflow">
  <div class="eqLogicThumbnailDisplay" style="border-left: solid 1px #EEE; padding-left: 25px;">
    <legend><i class="fas fa-cog"></i> {{Gestion}}</legend>
    <div class="eqLogicThumbnailContainer">

        <?php
          iotawatt_display::displayActionCard('{{Ajouter}}', 'fa-plus-circle', 'data-action="add"', 'logoPrimary');
          iotawatt_display::displayActionCard('{{Configuration}}', 'fa-wrench', 'data-action="gotoPluginConf"', 'logoSecondary');
          iotawatt_display::displayActionCard('{{Puissances}}', 'icon kiko-electricity', 'id="bt_poweriotawatt"', 'logoSecondary');
          iotawatt_display::displayActionCard('{{Graphiques}}', 'fa-chart-bar', 'id="bt_chartiotawatt"', 'logoSecondary');
          iotawatt_display::displayActionCard('{{Santé}}', 'fa-heartbeat', 'id="bt_healthiotawatt"', 'logoSecondary');
          iotawatt_display::displayActionCard('{{Documentation}}', 'fa-book-reader', 'id="bt_documentationiotawatt" data-location="' . $plugin->getDocumentation() . '"', 'logoSecondary');
        ?>
    </div>
    <legend><i class="fas fa-sun"></i> {{Mes box IotaWatt}}</legend>
		<?php
            if (count($eqLogics) == 0) {
                echo '<br><div class="text-center" style="font-size:1.2em;font-weight:bold;">{{Aucun équipement, cliquez sur "Ajouter" pour commencer}}</div>';
            } else {
                // Champ de recherche
                echo '<div class="input-group" style="margin:5px;">';
                echo '<input class="form-control roundedLeft" placeholder="{{Rechercher}}" id="in_searchEqlogic">';
                echo '<div class="input-group-btn">';
                echo '<a id="bt_resetSearch" class="btn" style="width:30px"><i class="fas fa-times"></i></a>';
                echo '<a class="btn roundedRight hidden" id="bt_pluginDisplayAsTable" data-coreSupport="1" data-state="0"><i class="fas fa-grip-lines"></i></a>';
                echo '</div>';
                echo '</div>';
                iotawatt_display::displayEqLogicThumbnailContainer($eqLogics);
            }
        ?>
  </div>

  <div class="col-xs-12 eqLogic" style="display: none;">
    <div class="input-group pull-right" style="display:inline-flex">
      <span class="input-group-btn">
        <a class="btn btn-default btn-sm eqLogicAction roundedLeft" data-action="configure"><i class="fas fa-cogs"></i> {{Configuration avancée}}</a>
        <a class="btn btn-default btn-sm eqLogicAction" data-action="copy"><i class="fas fa-copy"></i> {{Dupliquer}}</a>
        <a class="btn btn-sm btn-success eqLogicAction" data-action="save"><i class="fas fa-check-circle"></i> {{Sauvegarder}}</a>
        <a class="btn btn-danger btn-sm eqLogicAction roundedRight" data-action="remove"><i class="fas fa-minus-circle"></i> {{Supprimer}}</a>
      </span>
    </div>
    <ul class="nav nav-tabs" role="tablist">
      <li role="presentation"><a href="#" class="eqLogicAction" aria-controls="home" role="tab" data-toggle="tab" data-action="returnToThumbnailDisplay"><i class="fas fa-arrow-circle-left"></i></a></li>
      <li role="presentation" class="active"><a href="#eqlogictab" aria-controls="home" role="tab" data-toggle="tab"><i class="fas fa-tachometer-alt"></i> {{Équipement}}</a></li>
      <li role="presentation"><a href="#commandtab" aria-controls="profile" role="tab" data-toggle="tab"><i class="fas fa-list-alt"></i> {{Commandes}}</a></li>
    </ul>
    <div class="tab-content" style="height:calc(100% - 50px);overflow:auto;overflow-x: hidden;">
      <div role="tabpanel" class="tab-pane active" id="eqlogictab">
        <div class="col-xs-6">
          <form class="form-horizontal">
            <fieldset>
              <div class="form-group">
                <legend><i class="fas fa-sitemap icon_green"></i> {{Général}}</legend>
                <label class="col-sm-4 control-label">{{Nom}}</label>
                <div class="col-sm-5">
                  <input type="text" class="eqLogicAttr form-control" data-l1key="id" style="display : none;" />
                  <input type="text" class="eqLogicAttr form-control" data-l1key="name" placeholder="{{Nom de la box}}" />
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label">{{Objet parent}}</label>
                <div class="col-sm-5">
                  <select id="sel_object" class="eqLogicAttr form-control" data-l1key="object_id">
                    <option value="">{{Aucun}}</option>
                    <?php
                      $options = '';
                      foreach ((jeeObject::buildTree(null, false)) as $object) {
                          $options .= '<option value="' . $object->getId() . '">' . str_repeat('&nbsp;&nbsp;', $object->getConfiguration("parentNumber")) . $object->getName() . '</option>';
                      }
                      echo $options;
                    ?>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="col-sm-4 control-label">{{Catégorie}}</label>
                <div class="col-sm-8">
                  <?php
                      foreach (jeedom::getConfiguration('eqLogic:category') as $key => $value) {
                          echo '<label class="checkbox-inline">';
                          echo '<input type="checkbox" class="eqLogicAttr" data-l1key="category" data-l2key="' . $key . '" />' . $value['name'];
                          echo '</label>';
                      }
                  ?>
                </div>
              </div>

              <div class="form-group">
                <label class="col-sm-4 control-label">{{Options}}</label>
                <div class="col-sm-8">
                  <label class="checkbox-inline"><input type="checkbox" class="eqLogicAttr" data-l1key="isEnable" checked />{{Activer}}</label>
                  <label class="checkbox-inline"><input type="checkbox" class="eqLogicAttr" data-l1key="isVisible" checked />{{Visible}}</label>
                </div>
              </div>

              <div class="form-group">
                <label class="col-sm-4 control-label help" data-help="{{Cocher la case pour laisser le plugin réorganiser les commandes à la sauvegarde de l'équipement.}}</br>{{Laissez décoché pour modifier l'ordre des commandes.}}">{{Réorganiser les commandes automatiquement}}
                </label>
                <div class="col-sm-8">
                  <input type="checkbox" class="eqLogicAttr form-control" id="reOrderCmd" data-l1key="configuration" data-l2key="reOrderCmd" />
                </div>
              </div>

              <div class="form-group">
                <label class="col-sm-4 control-label help" data-help="{{Cocher la case pour utiliser le widget associé au type de l'appareil.}}</br>{{Laissez décoché pour laisser le core générer le widget par défaut.}}">{{Widget équipement}}
                </label>
                <div class="col-sm-8">
                  <input type="checkbox" class="eqLogicAttr form-control" id="widgetTemplate" data-l1key="configuration" data-l2key="widgetTemplate" />
                </div>
              </div>

              <div class="form-group">
                <label class="col-sm-4 control-label help" data-help="{{Renseignez l'adresse IP}}">{{Adresse IP}}
                </label>
                <div class="col-sm-6">
                  <input type="text" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="ip" placeholder="{{Adresse IP}}">
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label help" data-help="{{Renseignez l'identifiant}}">{{Identifiant}}
                </label>
                <div class="col-sm-6">
                  <input type="text" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="id" placeholder="{{Identifiant}}">
                </div>
              </div>
              <div class="form-group">
                <label class="col-sm-4 control-label help" data-help="{{Renseignez le mot de passe}}"> {{Mot de passe}}
                </label>
                <div class="col-sm-6">
                  <input type="text" class="eqLogicAttr form-control inputPassword" data-l1key="configuration" data-l2key="password">
                </div>
              </div>

            </fieldset>
            <fieldset>
              <legend><i class="fas fa-cogs icon_orange"></i> {{Paramètres}}</legend>
              <div class="form-group">
                <label class="col-sm-4 control-label help" data-help="{{Résolution des valeurs.<br/>La valeur par défaut est auto, qui sélectionne un groupe de temps fixe pour obtenir environ 360 points (résolution=bas) ou 720 points (résolution=haut).}}"> {{Groupement}}
                </label>
                <div class="col-sm-6">
                  <select id="sel_group" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="group">
                    <option value="auto" >{{Automatique}}</option>
                    <option value="all">{{Toutes}}</option>
                    <option value="manual">{{Manuel}}</option>
                  </select>
                </div>
              </div>
              <div class="form-group" id="idResolution">
                <label class="col-sm-4 control-label help" data-help="{{Résolution des valeurs.<br/>La valeur par défaut est auto, qui sélectionne un groupe de temps fixe pour obtenir environ 360 points (résolution=bas) ou 720 points (résolution=haut).}}"> {{Résolution}}
                </label>
                <div class="col-sm-6">
                  <select id="sel_resolution" class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="resolution">
                    <option value="high">{{Élevée}}</option>
                    <option value="low">{{Basse (par défaut)}}</option>
                  </select>
                </div>
              </div>
              <div class="form-group" id="idManualGroup">
                  <label class="col-sm-4 control-label help">{{Intervalle}}
                      <sup><i class="fas fa-question-circle tooltips tippied" title="{{Intervalle entre chaque valeur.}}<br\>{{Attention : un trop petit intervalle pour une plage trop grande peut mettre du temps/de la ressource à être récupéré.}}<br\>{{10s : (10 secondes)}}<br\>{{5m : (cinq minutes)}}<br\>{{1h : (une heure)}}<br\>{{1M : (un mois)}}"></i></sup>
                  </label>
                  <div class="col-sm-6" style="display:inline-flex">
                      <select class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="manualGroup" data-l3key="value" title="{{Valeur}}" >
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                          <option value="6">6</option>
                          <option value="7">7</option>
                          <option value="8">8</option>
                          <option value="9">9</option>
                          <option value="10">10</option>
                          <option value="15">15</option>
                          <option value="30">30</option>
                          <option value="50">50</option>
                      </select>
                      <select class="eqLogicAttr form-control" data-l1key="configuration" data-l2key="manualGroup" data-l3key="unit" title="{{Unité}}" >
                          <option value="s">{{seconde(s)}}</option>
                          <option value="m">{{minute(s)}}</option>
                          <option value="h">{{heure(s)}}</option>
                          <option value="d">{{jour(s)}}</option>
                          <option value="w">{{semaine(s)}}</option>
                          <option value="M">{{mois(s)}}</option>
                          <option value="y">{{année(s)}}</option>
                      </select>
                  </div>
              </div>
            </fieldset>
          </form>
        </div>
        <div class="col-sm-6">
          <form class="form-horizontal">
            <legend><i class="fas fa-info-circle icon_yellow"></i> {{Informations}}</legend>
            <fieldset>
			    <div id="idTableEqLogicConfig">
			        <?php
			            iotawatt_display::displayFormGroupEqLogic('mac','{{Adresse MAC}}');
			            iotawatt_display::displayFormGroupEqLogic('name','{{Nom}}');
			            iotawatt_display::displayFormGroupEqLogic('timediff','{{Décalage fuseau horaire }}');
			            iotawatt_display::displayFormGroupEqLogic('firmwareVersion','{{Version du firmware}}');
			            iotawatt_display::displayFormGroupEqLogic('admin','{{Mot de passe admin}}');
			            iotawatt_display::displayFormGroupEqLogic('user','{{Mot de passe utilisateur}}');
			            iotawatt_display::displayFormGroupEqLogic('localAccess','{{Mot de passe accès local}}');
			            iotawatt_display::displayFormGroupEqLogic('nbInputs','{{Nombre d\'entrées}}');
			            iotawatt_display::displayFormGroupEqLogic('nbOutputs','{{Nombre de sorties}}');
			            iotawatt_display::displayFormGroupEqLogic('connecttime','{{Temps de connexion Wi-Fi}}', 'status');
			            iotawatt_display::displayFormGroupEqLogic('SSID','{{SSID}}');
			            iotawatt_display::displayFormGroupEqLogic('RSSI','{{RSSI}}', 'status');
			            iotawatt_display::displayFormGroupEqLogic('lowbat','{{Batterie faible}}', 'status');
			            iotawatt_display::displayFormGroupEqLogic('update','{{Version des mises à jour}}');
			            iotawatt_display::displayFormGroupEqLogic('lastUpdateTime','{{Date de de dernière mise à jour}}');
			            iotawatt_display::displayFormGroupEqLogic('startTime','{{Date de démarrage}}');
			            iotawatt_display::displayFormGroupEqLogic('runSeconds','{{Temps démarré}}');
			            iotawatt_display::displayFormGroupEqLogic('lastValueUpdate','{{Date de de dernière actualisation}}','status', );
			        ?>
			    </div>
              <div class="form-group">
                <div class="col-sm-10" style="display:none;">
                  <center>
                    <img src="plugins/iotawatt/plugin_info/iotawatt_icon.png" data-original=".svg" id="img_device" class="img-responsive" style="max-height:450px;max-width:400px" onerror="this.src='core/img/no_image.gif'" />
                  </center>
                </div>
              </div>
              <a class="btn btn-sm btn-success eqLogicAction roundedLeft roundedRight" data-action="backup"><i class="icon kiko-save"></i> {{Backup}}</a>
            </fieldset>
          </form>
        </div>
      </div>
      <div role="tabpanel" class="tab-pane" id="commandtab">
	    <a class="btn btn-warning btn-sm cmdAction pull-right" data-action="addCommand" style="margin-top:5px;"><i class="fas fa-plus-circle"></i> {{Ajout de commande}}</a>
        <table id="table_cmd" class="table table-bordered table-condensed">
          <thead>
            <tr>
              <th>{{Nom}}</th>
              <th>{{Type}}</th>
              <th>{{Canal}}</th>
              <th>{{Options}}</th>
              <th>{{Valeur}}</th>
              <th>{{Paramètres}}</th>
              <th>{{Action}}</th>
            </tr>
          </thead>
          <tbody>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<?php
include_file('desktop', 'iotawatt', 'js', 'iotawatt');
include_file('core', 'plugin.template', 'js');
?>