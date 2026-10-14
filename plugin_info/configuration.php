
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

   require_once dirname(__FILE__) . '/../../../core/php/core.inc.php';
   include_file('core', 'authentification', 'php');
   if (!isConnect('admin')) {
       include_file('desktop', '404', 'php');
       die();
   }
   $plugin = plugin::byId('iotawatt');
   $update = $plugin->getUpdate();
   $deviceCount = count(iotawatt::byType('iotawatt'));
   $cronRefresh = (string) config::byKey('autorefresh', 'iotawatt', 'never');
   $daemonRefresh = (string) config::byKey('deamonRefresh', 'iotawatt', '');
   $chartPeriod = (int) config::byKey('chartDefaultPeriod', 'iotawatt', 7);
   sendVarToJS('version', iotawatt::$_pluginVersion);
   ?>
   <style>
       #infoCmdLinky {
           margin-left: 5px;
       }
   </style>
<?php include_file('desktop', 'plugin-banner', 'css', 'iotawatt'); ?>

<form class="form-horizontal formIotawatt" id="configuration_plugin_iotawatt">
   <fieldset>
        <div class="iotawatt-config-page">
            <section class="iotawatt-config-hero">
                <div class="iotawatt-config-identity">
                    <div class="iotawatt-config-logo"><img src="plugins/iotawatt/plugin_info/iotawatt_icon.png" alt="IoTaWatt"></div>
                    <div>
                        <span class="iotawatt-config-eyebrow">{{Configuration du plugin}}</span>
                        <h2>IoTaWatt</h2>
                        <p>{{Connectez vos boîtiers IoTaWatt à Jeedom et suivez vos mesures d’énergie sur le réseau local.}}</p>
                    </div>
                </div>
                <div class="iotawatt-config-meta">
                    <span><i class="fas fa-code-branch"></i> {{Version}} <strong>v<?=htmlspecialchars(iotawatt::$_pluginVersion, ENT_QUOTES, 'UTF-8')?></strong></span>
                    <?php if (is_object($update)) { ?>
                        <span><i class="fas fa-calendar-alt"></i> <?=htmlspecialchars((string) $update->getLocalVersion(), ENT_QUOTES, 'UTF-8')?></span>
                        <span><i class="fas fa-stream"></i> <?=htmlspecialchars((string) $update->getConfiguration('version', 'stable'), ENT_QUOTES, 'UTF-8')?></span>
                        <span><i class="fas fa-cloud-download-alt"></i> <?=htmlspecialchars((string) $update->getSource(), ENT_QUOTES, 'UTF-8')?></span>
                    <?php } ?>
                </div>
                <div class="iotawatt-config-links">
                    <a class="btn btn-sm iotawatt-config-link-documentation" target="_blank" rel="noopener noreferrer" href="<?=htmlspecialchars((string) $plugin->getDocumentation(), ENT_QUOTES, 'UTF-8')?>"><i class="fas fa-book"></i> {{Documentation}}</a>
                    <a class="btn btn-sm iotawatt-config-link-changelog" target="_blank" rel="noopener noreferrer" href="<?=htmlspecialchars((string) $plugin->getChangelog(), ENT_QUOTES, 'UTF-8')?>"><i class="fas fa-list"></i> {{Changelog}}</a>
                    <a class="btn btn-sm iotawatt-config-link-community" target="_blank" rel="noopener noreferrer" href="https://community.jeedom.com/tag/plugin-iotawatt"><i class="fas fa-comments"></i> {{Communauté}}</a>
                </div>
            </section>

            <section class="iotawatt-config-summary" aria-label="{{Résumé de la configuration IoTaWatt}}">
                <article class="iotawatt-config-summary-card">
                    <span class="iotawatt-config-summary-icon"><i class="fas fa-bolt"></i></span>
                    <div><span class="iotawatt-config-summary-label">{{Appareils}}</span><strong><?= (int) $deviceCount ?></strong><small>{{configuré(s) dans Jeedom}}</small></div>
                </article>
                <article class="iotawatt-config-summary-card">
                    <span class="iotawatt-config-summary-icon"><i class="fas fa-clock"></i></span>
                    <div><span class="iotawatt-config-summary-label">{{Rafraîchissement cron}}</span><strong><?= htmlspecialchars($cronRefresh, ENT_QUOTES, 'UTF-8') ?></strong><small>{{planification enregistrée}}</small></div>
                </article>
                <article class="iotawatt-config-summary-card">
                    <span class="iotawatt-config-summary-icon"><i class="fas fa-tachometer-alt"></i></span>
                    <div><span class="iotawatt-config-summary-label">{{Rafraîchissement démon}}</span><strong><?= $daemonRefresh !== '' ? htmlspecialchars($daemonRefresh . ' s', ENT_QUOTES, 'UTF-8') : __('Désactivé', __FILE__) ?></strong><small>{{puissance et tension}}</small></div>
                </article>
                <article class="iotawatt-config-summary-card">
                    <span class="iotawatt-config-summary-icon"><i class="fas fa-chart-line"></i></span>
                    <div><span class="iotawatt-config-summary-label">{{Période graphique}}</span><strong><?= (int) $chartPeriod ?> {{jours}}</strong><small>{{valeur par défaut}}</small></div>
                </article>
            </section>

            <div class="iotawatt-config-grid">
                <section class="iotawatt-config-card iotawatt-config-card-wide">
                    <header><span class="iotawatt-config-card-icon"><i class="fas fa-cogs"></i></span><div><h3>{{Paramètres}}</h3></div></header>
                    <div class="iotawatt-config-card-body">
          <div class="form-group">
              <label class="col-lg-4 control-label">{{Intervalle de rafraîchissement de toutes les informations (cron)}}
      <sup><i class="fas fa-question-circle" title="{{Sélectionnez l'intervalle auquel le plugin ira récupérer les informations de iotawatt.}}</br>{{En fonction des commandes infos de l'équipement, les valeurs des unités Volts, Watts, Wh, Amps, VA, Hz, PF, VAR, VARh seront mises à jour.}}"></i></sup>
              </label>
              <div class="col-lg-4">
                  <select class="configKey form-control" data-l1key="autorefresh" >
                      <option value="* * * * *">{{Toutes les minutes}}</option>
                      <option value="*/2 * * * *">{{Toutes les 2 minutes}}</option>
                      <option value="*/3 * * * *">{{Toutes les 3 minutes}}</option>
                      <option value="*/4 * * * *">{{Toutes les 4 minutes}}</option>
                      <option value="*/5 * * * *">{{Toutes les 5 minutes}}</option>
                      <option value="*/6 * * * *">{{Toutes les 6 minutes}}</option>
                      <option value="*/7 * * * *">{{Toutes les 7 minutes}}</option>
                      <option value="*/8 * * * *">{{Toutes les 8 minutes}}</option>
                      <option value="*/9 * * * *">{{Toutes les 9 minutes}}</option>
                      <option value="*/10 * * * *">{{Toutes les 10 minutes}}</option>
                      <option value="*/15 * * * *">{{Toutes les 15 minutes}}</option>
                      <option value="*/20 * * * *">{{Toutes les 20 minutes}}</option>
                      <option value="*/25 * * * *">{{Toutes les 25 minutes}}</option>
                      <option value="*/30 * * * *">{{Toutes les 30 minutes}}</option>
                      <option value="*/35 * * * *">{{Toutes les 35 minutes}}</option>
                      <option value="*/40 * * * *">{{Toutes les 40 minutes}}</option>
                      <option value="*/45 * * * *">{{Toutes les 45 minutes}}</option>
                      <option value="*/50 * * * *">{{Toutes les 50 minutes}}</option>
                      <option value="*/55 * * * *">{{Toutes les 55 minutes}}</option>
                      <option value="*/60 * * * *">{{Toutes les heures}}</option>
                      <option value="never">{{Jamais}}</option>
                  </select>
              </div>
          </div>
          <div class="form-group">
              <label class="col-lg-4 control-label">{{Intervalle de rafraîchissement des informations de puissance/tension (démon)}}
                  <sup>
                      <i class="fas fa-question-circle" title="{{Sélectionnez l'intervalle auquel le plugin ira récupérer les informations de iotawatt.}}</br>{{Seules les valeurs d'entrées (0=Volts, 1-14=Watts) et sorties (Watts) sont mises à jour.}}">
                      </i>
                  </sup>
              </label>
              <div class="col-lg-4">
                  <select class="configKey form-control" data-l1key="deamonRefresh" >
                      <option value="1">{{Toutes les secondes}}</option>
                      <option value="2">{{Toutes les 2 secondes}}</option>
                      <option value="3">{{Toutes les 3 secondes}}</option>
                      <option value="4">{{Toutes les 4 secondes}}</option>
                      <option value="5">{{Toutes les 5 secondes}}</option>
                      <option value="6">{{Toutes les 6 secondes}}</option>
                      <option value="7">{{Toutes les 7 secondes}}</option>
                      <option value="8">{{Toutes les 8 secondes}}</option>
                      <option value="9">{{Toutes les 9 secondes}}</option>
                      <option value="10">{{Toutes les 10 secondes}}</option>
                      <option value="15">{{Toutes les 15 secondes}}</option>
                      <option value="20">{{Toutes les 20 secondes}}</option>
                      <option value="25">{{Toutes les 25 secondes}}</option>
                      <option value="30">{{Toutes les 30 secondes}}</option>
                      <option value="35">{{Toutes les 35 secondes}}</option>
                      <option value="40">{{Toutes les 40 secondes}}</option>
                      <option value="45">{{Toutes les 45 secondes}}</option>
                      <option value="50">{{Toutes les 50 secondes}}</option>
                      <option value="55">{{Toutes les 55 secondes}}</option>
                      <option value="">{{Jamais}}</option>
                  </select>
              </div>
          </div>
          <div class="form-group">
              <label class="col-lg-4 control-label">{{Commande puissance Linky}}
                  <sup>
                      <i class="fas fa-question-circle" title="{{Renseignez la commande de puissance de votre compteur Linky pour l'afficher sur le panel.}}">
                      </i>
                  </sup>
              </label>
              <div class="col-lg-4 input-group">
                  <input class="configKey form-control input-sm" data-l1key="powerLinky" />
                  <span class="input-group-btn">
                      <a class="btn btn-default btn-sm btn-success cmdPowerLinky"><i class="fas fa-list-alt"></i></a>
                  </span>
                  <span id="infoCmdPowerLinky">
                  </span>
              </div>
          </div>
          <div class="form-group">
              <label class="col-lg-4 control-label">{{Commande consommation Linky}}
                  <sup>
                      <i class="fas fa-question-circle" title="{{Renseignez la commande d'index de votre compteur Linky pour l'afficher sur le panel.}}">
                      </i>
                  </sup>
              </label>
              <div class="col-lg-4 input-group">
                  <input class="configKey form-control input-sm" data-l1key="linky" />
                  <span class="input-group-btn">
                      <a class="btn btn-default btn-sm btn-success cmdLinky"><i class="fas fa-list-alt"></i></a>
                  </span>
                  <span id="infoCmdLinky">
                  </span>
              </div>
          </div>
                    </div>
                </section>
                <section class="iotawatt-config-card iotawatt-config-card-wide">
                    <header><span class="iotawatt-config-card-icon"><i class="fas fa-chart-line"></i></span><div><h3>{{Paramètres par défaut du graphique}}</h3></div></header>
                    <div class="iotawatt-config-card-body">
      <div class="form-group">
         <label class="col-lg-4 control-label">{{Période par défaut (jours)}}
            <sup>
               <i class="fas fa-question-circle" title="{{Nombre de jours à afficher par défaut dans le graphique (1-31).}}">
               </i>
            </sup>
         </label>
         <div class="col-lg-4">
            <select class="configKey form-control" data-l1key="chartDefaultPeriod">
               <?php for ($i = 1; $i <= 31; $i++): ?>
                  <option value="<?php echo $i; ?>" <?php echo ($i == 7) ? 'selected' : ''; ?>><?php echo $i; ?> jour<?php echo ($i > 1) ? 's' : ''; ?></option>
               <?php endfor; ?>
            </select>
         </div>
      </div>
      <div class="form-group">
         <label class="col-lg-4 control-label">{{Type de graphique par défaut}}
            <sup>
               <i class="fas fa-question-circle" title="{{Type de graphique affiché par défaut (barres empilées, camembert, barres groupées, lignes, aires empilées, radar, carte thermique).}}">
               </i>
            </sup>
         </label>
         <div class="col-lg-4">
            <select class="configKey form-control" data-l1key="chartDefaultType">
               <option value="stacked">{{Barres empilées}}</option>
               <option value="stacked-total">{{Barres empilées total}}</option>
               <option value="pie" selected>{{Camembert total}}</option>
               <option value="pie-daily">{{Camembert journalier}}</option>
               <option value="grouped">{{Barres groupées}}</option>
               <option value="grouped-total">{{Barres groupées total}}</option>
               <option value="line">{{Lignes}}</option>
               <option value="area">{{Aires empilées}}</option>
               <option value="heatmap">{{Carte thermique}}</option>
            </select>
         </div>
      </div>
      <div class="form-group">
         <label class="col-lg-4 control-label">{{Tri par défaut}}
            <sup>
               <i class="fas fa-question-circle" title="{{Ordre de tri par défaut des équipements dans le graphique.}}">
               </i>
            </sup>
         </label>
         <div class="col-lg-4">
            <select class="configKey form-control" data-l1key="chartDefaultSort">
               <option value="cmd-asc">{{Nom de commande (A-Z)}}</option>
               <option value="cmd-desc">{{Nom de commande (Z-A)}}</option>
               <option value="consumption-desc" selected>{{Consommation (descendant)}}</option>
               <option value="consumption-asc">{{Consommation (ascendant)}}</option>
               <option value="equipment-asc">{{Équipement (A-Z)}}</option>
               <option value="equipment-desc">{{Équipement (Z-A)}}</option>
               <option value="peak-desc">{{Pic de consommation (descendant)}}</option>
               <option value="peak-asc">{{Pic de consommation (ascendant)}}</option>
               <option value="efficiency-desc">{{Efficacité (descendant)}}</option>
               <option value="efficiency-asc">{{Efficacité (ascendant)}}</option>
               <option value="cost-desc">{{Coût estimé (descendant)}}</option>
               <option value="cost-asc">{{Coût estimé (ascendant)}}</option>
               <option value="usage-pattern">{{Modèle d'usage}}</option>
            </select>
         </div>
      </div>
      <div class="form-group">
         <label class="col-lg-4 control-label">{{Configuration tarifaire EDF}}
            <sup>
               <i class="fas fa-question-circle" title="{{Configuration complète des tarifs EDF pour un calcul précis des coûts énergétiques.}}</br>{{Tous les champs sont pré-remplis avec les valeurs réglementées 2024.}}"></i>
            </sup>
         </label>
         <div class="col-lg-8">
            <div class="panel panel-default">
               <div class="panel-heading">
                  <h4 class="panel-title">{{Type d'offre}}</h4>
               </div>
               <div class="panel-body">
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Offre}}</label>
                     <div class="col-lg-9">
                        <select class="configKey form-control" data-l1key="tariffType">
                           <option value="base" selected>{{Tarif Base}}</option>
                           <option value="hphc">{{Heures Pleines/Heures Creuses}}</option>
                           <option value="tempo">{{Tempo}}</option>
                           <option value="ejp">{{EJP}}</option>
                        </select>
                     </div>
                  </div>
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Puissance souscrite}}</label>
                     <div class="col-lg-9">
                        <select class="configKey form-control" data-l1key="subscribedPower">
                           <option value="3" selected>{{3 kVA}}</option>
                           <option value="6">{{6 kVA}}</option>
                           <option value="9">{{9 kVA}}</option>
                           <option value="12">{{12 kVA}}</option>
                           <option value="15">{{15 kVA}}</option>
                           <option value="18">{{18 kVA}}</option>
                           <option value="24">{{24 kVA}}</option>
                           <option value="30">{{30 kVA}}</option>
                           <option value="36">{{36 kVA}}</option>
                        </select>
                     </div>
                  </div>
               </div>
            </div>

            <div class="panel panel-default">
               <div class="panel-heading">
                  <h4 class="panel-title">{{Abonnement (€/mois)}}</h4>
               </div>
               <div class="panel-body">
                  <div class="form-group subscription-base hidden">
                     <label class="col-lg-3 control-label">{{Tarif Base}}</label>
                     <div class="col-lg-9">
                        <input type="number" step="0.01" class="configKey form-control" data-l1key="subscriptionBase" placeholder="11.73" />
                     </div>
                  </div>
                  <div class="form-group subscription-hphc hidden">
                     <label class="col-lg-3 control-label">{{HP/HC}}</label>
                     <div class="col-lg-9">
                        <input type="number" step="0.01" class="configKey form-control" data-l1key="subscriptionHPHC" placeholder="15.74" />
                     </div>
                  </div>
                  <div class="form-group subscription-tempo hidden">
                     <label class="col-lg-3 control-label">{{Tempo}}</label>
                     <div class="col-lg-9">
                        <input type="number" step="0.01" class="configKey form-control" data-l1key="subscriptionTempo" placeholder="15.50" />
                     </div>
                  </div>
                  <div class="form-group subscription-ejp hidden">
                     <label class="col-lg-3 control-label">{{EJP}}</label>
                     <div class="col-lg-9">
                        <input type="number" step="0.01" class="configKey form-control" data-l1key="subscriptionEJP" placeholder="19.32" />
                     </div>
                  </div>
               </div>
            </div>

            <div class="panel panel-default tariff-hphc hidden">
               <div class="panel-heading">
                  <h4 class="panel-title">{{Horaires Heures Creuses/Pleines}}</h4>
               </div>
               <div class="panel-body">
                  <div class="alert alert-info">
                     <i class="fas fa-info-circle"></i> {{Configurez vos horaires heures creuses selon votre contrat Enedis. Vous pouvez définir jusqu'à 3 plages par jour.}}
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Lundi}}
                        <sup><i class="fas fa-question-circle" title="{{Plages horaires HC le lundi. Format: HH:MM-HH:MM, séparez plusieurs plages par une virgule}}"></i></sup>
                     </label>
                     <div class="col-lg-9">
                        <input type="text" class="configKey form-control" data-l1key="hcMonday" placeholder="02:00-07:00,13:00-16:00" />
                     </div>
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Mardi}}</label>
                     <div class="col-lg-9">
                        <input type="text" class="configKey form-control" data-l1key="hcTuesday" placeholder="02:00-07:00,13:00-16:00" />
                     </div>
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Mercredi}}</label>
                     <div class="col-lg-9">
                        <input type="text" class="configKey form-control" data-l1key="hcWednesday" placeholder="08:00-15:00" />
                     </div>
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Jeudi}}</label>
                     <div class="col-lg-9">
                        <input type="text" class="configKey form-control" data-l1key="hcThursday" placeholder="02:00-07:00,13:00-16:00" />
                     </div>
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Vendredi}}</label>
                     <div class="col-lg-9">
                        <input type="text" class="configKey form-control" data-l1key="hcFriday" placeholder="02:00-07:00,13:00-16:00" />
                     </div>
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Samedi}}</label>
                     <div class="col-lg-9">
                        <input type="text" class="configKey form-control" data-l1key="hcSaturday" placeholder="09:00-16:00" />
                     </div>
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Dimanche}}</label>
                     <div class="col-lg-9">
                        <input type="text" class="configKey form-control" data-l1key="hcSunday" placeholder="00:00-24:00" />
                     </div>
                  </div>
                  
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{Modèle rapide}}</label>
                     <div class="col-lg-9">
                        <button type="button" class="btn btn-sm btn-default" id="applyHCTemplate1">
                           <i class="fas fa-magic"></i> {{22h-6h tous les jours}}
                        </button>
                        <button type="button" class="btn btn-sm btn-default" id="applyHCTemplate2">
                           <i class="fas fa-magic"></i> {{Week-end entier en HC}}
                        </button>
                        <button type="button" class="btn btn-sm btn-default" id="clearAllHC">
                           <i class="fas fa-eraser"></i> {{Effacer tout}}
                        </button>
                     </div>
                  </div>
                  
                  <div class="alert alert-warning">
                     <strong>{{Format}}: </strong>{{HH:MM-HH:MM (ex: 02:00-07:00 ou 22:00-06:00 pour traverser minuit)}}<br>
                     <strong>{{Plusieurs plages}}: </strong>{{Séparez par une virgule (ex: 02:00-07:00,13:00-16:00)}}<br>
                     <strong>{{Tout le jour}}: </strong>{{00:00-24:00}}
                  </div>
               </div>
            </div>

            <div class="panel panel-default">
               <div class="panel-heading">
                  <h4 class="panel-title">{{Prix de l'énergie (€/kWh)}}</h4>
               </div>
               <div class="panel-body">
                  <div class="form-group tariff-base hidden">
                     <label class="col-lg-3 control-label">{{Tarif Base}}</label>
                     <div class="col-lg-9">
                        <input type="number" step="0.0001" class="configKey form-control" data-l1key="priceBase" placeholder="0.1952" />
                     </div>
                  </div>

                  <div class="tariff-hphc-prices hidden">
                     <div class="form-group">
                        <label class="col-lg-3 control-label">{{Heures Pleines}}</label>
                        <div class="col-lg-9">
                           <input type="number" step="0.0001" class="configKey form-control" data-l1key="priceHP" placeholder="0.2081" />
                        </div>
                     </div>
                     <div class="form-group">
                        <label class="col-lg-3 control-label">{{Heures Creuses}}</label>
                        <div class="col-lg-9">
                           <input type="number" step="0.0001" class="configKey form-control" data-l1key="priceHC" placeholder="0.1635" />
                        </div>
                     </div>
                  </div>

                  <div class="tariff-tempo hidden">
                     <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> {{Les horaires HC/HP pour Tempo sont configurés dans la section précédente. Seuls les tarifs diffèrent selon la couleur du jour.}}
                     </div>
                     
                     <h5><strong>{{Tarifs de l'énergie (€/kWh TTC)}}</strong></h5>
                     
                     <div class="row">
                        <div class="col-lg-12">
                           <table class="table table-bordered table-condensed">
                              <thead>
                                 <tr>
                                    <th></th>
                                    <th class="text-center" style="background-color: #000091; color: white;">🔵 {{Bleu}}</th>
                                    <th class="text-center" style="background-color: #FFFFFF; color: black; border: 1px solid #ddd;">⚪ {{Blanc}}</th>
                                    <th class="text-center" style="background-color: #E1000F; color: white;">🔴 {{Rouge}}</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 <tr>
                                    <td><strong>{{Heures Creuses}}</strong></td>
                                    <td>
                                       <input type="number" step="0.0001" class="configKey form-control input-sm" data-l1key="priceTempoHCBlue" placeholder="0.1232" />
                                    </td>
                                    <td>
                                       <input type="number" step="0.0001" class="configKey form-control input-sm" data-l1key="priceTempoHCWhite" placeholder="0.1391" />
                                    </td>
                                    <td>
                                       <input type="number" step="0.0001" class="configKey form-control input-sm" data-l1key="priceTempoHCRed" placeholder="0.1460" />
                                    </td>
                                 </tr>
                                 <tr>
                                    <td><strong>{{Heures Pleines}}</strong></td>
                                    <td>
                                       <input type="number" step="0.0001" class="configKey form-control input-sm" data-l1key="priceTempoHPBlue" placeholder="0.1494" />
                                    </td>
                                    <td>
                                       <input type="number" step="0.0001" class="configKey form-control input-sm" data-l1key="priceTempoHPWhite" placeholder="0.1730" />
                                    </td>
                                    <td>
                                       <input type="number" step="0.0001" class="configKey form-control input-sm" data-l1key="priceTempoHPRed" placeholder="0.6468" />
                                    </td>
                                 </tr>
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
                  
                  <div class="tariff-ejp hidden">
                     <div class="alert alert-info">
                        <i class="fas fa-info-circle"></i> {{L'option EJP (Effacement Jours de Pointe) a 22 jours rouges par an avec tarif très élevé.}}
                     </div>
                     
                     <div class="form-group">
                        <label class="col-lg-3 control-label">{{Heures normales}}</label>
                        <div class="col-lg-9">
                           <input type="number" step="0.0001" class="configKey form-control" data-l1key="priceEJPNormal" placeholder="0.1418" />
                        </div>
                     </div>
                     <div class="form-group">
                        <label class="col-lg-3 control-label">{{Heures de Pointe Mobile}}</label>
                        <div class="col-lg-9">
                           <input type="number" step="0.0001" class="configKey form-control" data-l1key="priceEJPMobile" placeholder="1.0867" />
                        </div>
                     </div>
                  </div>
               </div>
            </div>

            <div class="panel panel-default">
               <div class="panel-heading">
                  <h4 class="panel-title">{{Taxes et contributions sur abonnement}}</h4>
               </div>
               <div class="panel-body">
                  <div class="alert alert-info">
                     <i class="fas fa-info-circle"></i> {{Les tarifs de l'énergie sont déjà TTC (incluent l'accise et la TVA). Seul l'abonnement nécessite le calcul de la CTA et de la TVA.}}
                  </div>
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{CTA (%)}}
                        <sup>
                           <i class="fas fa-question-circle" title="{{Contribution Tarifaire d'Acheminement - 21,93% de l'abonnement HT}}"></i>
                        </sup>
                     </label>
                     <div class="col-lg-9">
                        <input type="number" step="0.01" class="configKey form-control" data-l1key="taxCTA" placeholder="21.93" />
                     </div>
                  </div>
                  <div class="form-group">
                     <label class="col-lg-3 control-label">{{TVA sur abonnement (%)}}
                        <sup>
                           <i class="fas fa-question-circle" title="{{TVA appliquée sur (abonnement HT + CTA) - 20%}}"></i>
                        </sup>
                     </label>
                     <div class="col-lg-9">
                        <input type="number" step="0.01" class="configKey form-control" data-l1key="taxTVA" placeholder="20" />
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>
                    </div>
                </section>
            </div>
        </div>
   </fieldset>
</form>
<?php include_file('desktop', 'configuration', 'js', 'iotawatt'); ?>