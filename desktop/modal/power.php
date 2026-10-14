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

require_once __DIR__ . '/../../core/class/iotawatt.power.class.php';

// Initialisation
$powerData = new IotawattPowerData();
$cmdArray = $powerData->collectData();
$logos = IotawattPowerData::getTendanceLogos();

// Configuration tarifaire pour les calculs de coûts
$tariffType = config::byKey('tariffType', 'iotawatt', 'base');
$subscribedPower = config::byKey('subscribedPower', 'iotawatt', 6);
sendVarToJS('tariffType', $tariffType);
sendVarToJS('subscribedPower', $subscribedPower);
sendVarToJS('energyRateHP', config::byKey('energyRateHP', 'iotawatt', 0.1808));
sendVarToJS('energyRateHC', config::byKey('energyRateHC', 'iotawatt', 0.1256));
sendVarToJS('subscriptionDailyCost', 0); // Sera calculé côté JS

/**
 * Fonction simple de calcul de coût pour un jour
 * Utilise une approximation basique pour éviter la dépendance à chart.php
 */
function calculateDailyCost($consumptionKwh, $date = null) {
    if ($date === null) {
        $date = date('Y-m-d');
    }
    
    // Si consommation nulle, retourner 0
    if ($consumptionKwh == 0) {
        return 0;
    }
    
    $tariffType = config::byKey('tariffType', 'iotawatt', 'base');
    $rateHP = config::byKey('energyRateHP', 'iotawatt', 0.1808);
    $rateHC = config::byKey('energyRateHC', 'iotawatt', 0.1256);
    
    // Calcul simplifié du coût énergétique
    if ($tariffType === 'hphc') {
        // Répartition approximative 60% HP / 40% HC
        $energyCost = ($consumptionKwh * 0.6 * $rateHP) + ($consumptionKwh * 0.4 * $rateHC);
    } else if ($tariffType === 'tempo') {
        // Utiliser le tarif moyen Tempo (simplifié)
        $energyCost = $consumptionKwh * 0.15; // Approximation
    } else {
        // Base: tarif unique
        $energyCost = $consumptionKwh * $rateHP;
    }
    
    // Ajouter la part d'abonnement journalier (environ 1/30 de l'abonnement mensuel)
    $subscribedPower = config::byKey('subscribedPower', 'iotawatt', 6);
    $subscriptionMonthly = 12.0; // Approximation pour 6 kVA
    $subscriptionDaily = $subscriptionMonthly / 30;
    
    $totalCost = $energyCost + $subscriptionDaily;
    
    return $totalCost;
}

/**
 * Calcule la couleur basée sur le pourcentage
 * @param float $pourcent
 * @return string
 */
function getColorForPourcentage($pourcent) {
    return IotawattPowerData::getColorForPourcentage($pourcent);
}

/**
 * Échappe les données HTML
 * @param mixed $value
 * @return string
 */
function h($value) {
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}

/**
 * Affiche une cellule de configuration
 * @param array $data
 * @return string
 */
function renderConfigCell($data) {
    $html = '<td>';
    if (!empty($data['id'])) {
        $html .= sprintf(
            '<a class="btn btn-default btn-xs tooltipstered eqLogicAction roundedLeft" data-id="%s" data-action="configureEqLogic" title="{{Configuration de l\'équipement}}"><i class="fas fa-cogs"></i></a>',
            h($data['id'])
        );
        $html .= $data['eqLink'];
    }
    $html .= '</td>';
    return $html;
}

/**
 * Affiche une cellule de nom avec icônes
 * @param array $data
 * @return string
 */
function renderNameCell($data) {
    $html = '<td>';
    
    // Boutons de configuration des commandes
    if (!empty($data['powerId']) || !empty($data['consoId'])) {
        $html .= '<div class="input-group" style="display:inline-flex;">';
        
        if (!empty($data['powerId'])) {
            $html .= sprintf(
                '<a class="btn btn-default btn-xs tooltipstered cmdAction roundedLeft" data-cmd_id="%s" data-action="configure" title="{{Configuration de la commande de puissance}}"><i class="icon kiko-lightning"></i></a>',
                h($data['powerId'])
            );
        }
        
        if (!empty($data['consoId'])) {
            $html .= sprintf(
                '<a class="btn btn-default btn-xs tooltipstered cmdAction roundedRight" data-cmd_id="%s" data-action="configure" title="{{Configuration de la commande de consommation}}"><i class="icon kiko-electricity"></i></a>',
                h($data['consoId'])
            );
        }
        
        $html .= '</div>';
    }
    
    // Icône spéciale pour Linky
    if (!empty($data['isLinky'])) {
        $html .= '<span class="iconPowerConso"><i class="fas fa-bolt" style="color: #ffc107;"></i></span>';
    }
    // Icône spéciale pour Total
    elseif (!empty($data['isTotal'])) {
        $html .= '<span class="iconPowerConso"><i class="fas fa-calculator" style="color: #333;"></i></span>';
    }
    // Icône normale
    else {
        $icon = $data['powerIcon'] ?? $data['consoIcon'] ?? '';
        if (!empty($icon)) {
            $html .= '<span class="iconPowerConso">' . $icon . '</span>';
        }
    }
    
    // Nom
    $name = $data['consoName'] ?? $data['powerName'] ?? '';
    $name = str_replace([__('Consommation', __FILE__), __('Puissance', __FILE__)], '', $name);
    $isTotal = empty($data['id']) ? 1 : 0;
    $html .= sprintf('<span class="namePowerConso" data-total="%d">%s</span>', $isTotal, $name);
    
    $html .= '</td>';
    return $html;
}

/**
 * Affiche une cellule de puissance
 * @param array $data
 * @param array $logos
 * @return string
 */
function renderPowerCell($data, $logos) {
    $html = '<td>';
    
    if (empty($data['powerId'])) {
        // Affichage du total
        $html .= sprintf(
            '<div class="cmd label label-info cursor history power" data-action="powerSum">%s %s</div>',
            h($data['power']),
            h($data['powerUnit'])
        );
    } else {
        $isLinky = !empty($data['isLinky']) ? 1 : 0;
        
        // Logo de tendance avant si Linky
        if ($isLinky) {
            $html .= '<span class="floatRight">' . $data['logoTendancePower'] . '</span>';
        }
        
        // Valeur de puissance
        $title = sprintf(
            '{{Date de collecte : }}%s<br/>{{Date de valeur : }}%s',
            h($data['powerCollectDate']),
            h($data['powerValueDate'])
        );
        $html .= sprintf(
            '<div class="cmd label cursor history power" data-linky="%d" data-cmd_id="%s" title="%s">%s %s</div> ',
            $isLinky,
            h($data['powerId']),
            $title,
            h($data['power']),
            h($data['powerUnit'])
        );
        
        // Logo de tendance après si non-Linky
        if (!$isLinky) {
            $html .= $data['logoTendancePower'];
        }
    }
    
    $html .= '</td>';
    return $html;
}

/**
 * Affiche une cellule de consommation d'hier
 * @param array $data
 * @return string
 */
function renderConsoYesterdayCell($data) {
    $html = '<td>';
    
    if (empty($data['consoId'])) {
        // Placeholder pour le total
        $html .= '<div class="cmd label label-info consoTotY" data-action="totalYesterday"></div>';
        $html .= '<div class="cmd label label-info consoTotY-cost" data-action="totalYesterday" style="display: none; margin-top: 2px;"></div>';
    } else {
        $stats = IotawattPowerData::calculateConsoStats($data);
        $valueInfoYest = cmd::autoValueArray($stats['yesterday'], 2, $data['consoOldUnit']);
        $isLinky = !empty($data['isLinky']) ? 1 : 0;
        
        // Calculer le coût d'hier
        // Linky retourne déjà des kWh, les autres retournent des Wh
        $yesterdayKwh = $isLinky ? $stats['yesterday'] : ($stats['yesterday'] / 1000);
        $yesterday = date('Y-m-d', strtotime('-1 day'));
        $costYesterday = calculateDailyCost($yesterdayKwh, $yesterday);
        
        $html .= sprintf(
            '<div class="cmd label label-info cursor history consoTotY" data-linky="%d" data-cmd_id="%s" data-kwh="%s">%s %s</div>',
            $isLinky,
            h($data['consoId']),
            $yesterdayKwh,
            h($valueInfoYest[0]),
            h($valueInfoYest[1])
        );
        
        $html .= sprintf(
            '<div class="cmd label label-info cursor history consoTotY-cost" data-linky="%d" data-cmd_id="%s" data-cost="%s" style="display: none; margin-top: 2px;">%s €</div>',
            $isLinky,
            h($data['consoId']),
            $costYesterday,
            number_format($costYesterday, 2)
        );
    }
    
    $html .= '</td>';
    return $html;
}

/**
 * Affiche une cellule de consommation du jour avec pourcentage
 * @param array $data
 * @return string
 */
function renderConsoTodayCell($data) {
    $html = '<td>';
    
    if (empty($data['consoId'])) {
        // Placeholder pour le total
        $html .= '<div class="cmd label label-info consoTotT" data-action="totalDay"></div>';
        $html .= '<div class="cmd label label-info consoTotT-cost" data-action="totalDay" style="display: none; margin-top: 2px;"></div>';
        $html .= '<div class="cmd label consoTotPourcent" data-action="sum"></div>';
    } else {
        $stats = IotawattPowerData::calculateConsoStats($data);
        $valueInfoT = cmd::autoValueArray($stats['today'], 2, $data['consoOldUnit'] ?? 'Wh');
        $consoTodayVal = round($valueInfoT[0], 2);
        $consoPourcent = $stats['percentage'];
        
        // Calculer le coût du jour
        // Linky retourne déjà des kWh, les autres retournent des Wh
        $todayKwh = $isLinky ? $stats['today'] : ($stats['today'] / 1000);
        $today = date('Y-m-d');
        $costToday = calculateDailyCost($todayKwh, $today);
        
        // Formater le pourcentage avec signe
        $posConsoPourcent = ($consoPourcent > 0 ? '+' : '') . number_format($consoPourcent, 2, '.', '');
        $isLinky = !empty($data['isLinky']) ? 1 : 0;
        
        $html .= sprintf(
            '<div class="cmd label label-info cursor history consoTotT" data-linky="%d" data-cmd_id="%s" data-kwh="%s">%s %s</div>',
            $isLinky,
            h($data['consoId']),
            $todayKwh,
            h($consoTodayVal),
            h($valueInfoT[1])
        );
        
        $html .= sprintf(
            '<div class="cmd label label-info cursor history consoTotT-cost" data-linky="%d" data-cmd_id="%s" data-cost="%s" style="display: none; margin-top: 2px;">%s €</div>',
            $isLinky,
            h($data['consoId']),
            $costToday,
            number_format($costToday, 2)
        );
        
        $color = IotawattPowerData::getColorForPourcentage($consoPourcent);
        $html .= sprintf(
            '<div class="cmd label label-info cursor history consoTotPourcent" data-linky="%d" style="background-color:%s !important;" data-cmd_id="%s">%s %%</div>',
            $isLinky,
            h($color),
            h($data['consoId']),
            h($posConsoPourcent)
        );
    }
    
    $html .= '</td>';
    return $html;
}

?>
<style>
.tablesorter-resizable-container {
    display: none;
}
.scanHender {
    cursor: pointer !important;
    width: 100%;
}
.power,
.conso,
.consoTotY,
.consoTotT,
.consoTotPourcent,
.consoSumPourcent,
.consoLinkyPourcent {
    color: var(--linkHoverLight-color) !important;
}
.iconPowerConso {
    font-size: 24px;
}
.iconPowerConso i {
    display: inline-block;
    width: 2em;
    text-align: center;
    border: 1px solid silver;
    border-radius: 0.25em;
}
.cmd.consoTotY[data-action="totalYesterday"],
.cmd.consoTotY[data-linky="1"],
.floatRight,
.namePowerConso[data-total="1"],
.cmd.power[data-linky="1"] {
    float: right;
}
.redTendance {
    background-color: var(--al-danger-color) !important;
}
.blueTendance {
    background-color: var(--al-info-color) !important;
}
.greenTendance {
    background-color: var(--bt-success-color) !important;
}
.cmd.power[data-action="powerSum"] {
    float: right;
    background-color: black !important;
    color: white !important;
    font-size: 1.5em !important;
    font-weight: bolder;
}
.linky-row {
    background-color: rgba(255, 193, 7, 0.1) !important;
    border-top: 2px solid #ffc107 !important;
    border-bottom: 2px solid #ffc107 !important;
    box-shadow: 0 2px 4px rgba(255, 193, 7, 0.2);
}
.linky-row td {
    font-weight: bold !important;
    padding: 12px 8px !important;
}
.linky-row:hover {
    background-color: rgba(255, 193, 7, 0.15) !important;
}
.total-row {
    background-color: rgba(0, 0, 0, 0.05) !important;
    border-top: 2px solid #333 !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.total-row td {
    font-weight: bold !important;
    padding: 12px 8px !important;
}
.total-row:hover {
    background-color: rgba(0, 0, 0, 0.08) !important;
}
</style>

<div style="margin-bottom: 15px; text-align: right;">
    <label id="toggleValueType" class="toggle-switch" style="display: inline-flex; align-items: center; cursor: pointer; user-select: none; background: rgba(74, 158, 255, 0.1); padding: 8px 15px; border-radius: 20px; font-weight: 600;">
        <span style="margin-right: 10px; color: var(--txt-color);">kWh</span>
        <div style="position: relative; width: 50px; height: 24px; background: #ccc; border-radius: 12px; transition: background 0.3s;">
            <input type="checkbox" style="opacity: 0; width: 0; height: 0;">
            <span style="position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: white; border-radius: 50%; transition: transform 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></span>
        </div>
        <span style="margin-left: 10px; color: var(--txt-color);">€</span>
    </label>
</div>

<table class="table table-condensed tablesorter" id="table_poweriotawatt">
    <thead>
        <tr>
            <th><span class="scanHender">{{Appareil IoTaWatt}}</span></th>
            <th><span class="scanHender">{{Nom}}</span></th>
            <th class="string-max"><span class="scanHender">{{Puissance}}</span></th>
            <th><span class="scanHender">{{Consommation hier (0h-24h)}}</span></th>
            <th><span class="scanHender">{{Consommation du jour (0h-24h)}}</span></th>
        </tr>
    </thead>
    <tbody>
        <?php foreach ($cmdArray as $id => $value): 
            // Déterminer la classe CSS de la ligne
            $rowClass = '';
            if (!empty($value['isLinky'])) {
                $rowClass = 'linky-row';
            } elseif (!empty($value['isTotal'])) {
                $rowClass = 'total-row';
            }
        ?>
            <tr class="<?php echo $rowClass; ?>">
                <?php 
                echo renderConfigCell($value);
                echo renderNameCell($value);
                echo renderPowerCell($value, $logos);
                echo renderConsoYesterdayCell($value);
                echo renderConsoTodayCell($value);
                ?>
            </tr>
        <?php endforeach; ?>
    </tbody>
</table>

<?php
include_file('desktop', 'power', 'js', 'iotawatt');
?>
