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

try {
	require_once dirname(__FILE__) . '/../../../../core/php/core.inc.php';
	include_file('core', 'authentification', 'php');

	if (!isConnect('admin')) {
		throw new Exception(__('401 - Accès non autorisé', __FILE__));
	}

	ajax::init();

    if (init('action') == 'getUnite') {
        $result = iotawatt::getParamUnits(init('unit'), 'all');
        ajax::success($result);
    }

    if (init('action') == 'getImage') {
        $eqLogic = iotawatt::byId(init('id'));
        if (!is_object($eqLogic)) {
            throw new Exception(__('iotawatt eqLogic non trouvé : ', __FILE__) . init('id'));
        }
        $result = $eqLogic->getImage();
        ajax::success($result);
    }

    if (init('action') == 'reloadHistory') {
        ajax::success(iotawatt::reloadHistory(init('id'), init('begin')));
    }

    if (init('action') == 'getStatsPeriod') {
        $cmdId = init('cmdId');
        $period = init('period'); // 'day', 'month', 'year'
        
        $cmd = cmd::byId($cmdId);
        if (!is_object($cmd)) {
            throw new Exception(__('Commande non trouvée : ', __FILE__) . $cmdId);
        }
        
        if (!$cmd->getIsHistorized()) {
            ajax::success(array('error' => __('Commande non historisée', __FILE__)));
        }
        
        $unit = $cmd->getUnite();
        $isWh = ($unit == 'Wh');
        
        // Définir les périodes selon le type demandé
        switch ($period) {
            case 'day':
                $previousStart = date('Y-m-d 00:00:00', strtotime('yesterday'));
                $previousEnd = date('Y-m-d 23:59:59', strtotime('yesterday'));
                $currentStart = date('Y-m-d 00:00:00');
                $currentEnd = date('Y-m-d 23:59:59');
                $previousLabel = __('Hier', __FILE__);
                $currentLabel = __('Aujourd\'hui', __FILE__);
                break;
            case 'month':
                $previousStart = date('Y-m-01 00:00:00', strtotime('first day of last month'));
                $previousEnd = date('Y-m-t 23:59:59', strtotime('last day of last month'));
                $currentStart = date('Y-m-01 00:00:00');
                $currentEnd = date('Y-m-t 23:59:59');
                $previousLabel = __('Mois dernier', __FILE__);
                $currentLabel = __('Ce mois', __FILE__);
                break;
            case 'year':
                $previousStart = date('Y-01-01 00:00:00', strtotime('first day of january last year'));
                $previousEnd = date('Y-12-31 23:59:59', strtotime('last day of december last year'));
                $currentStart = date('Y-01-01 00:00:00');
                $currentEnd = date('Y-12-31 23:59:59');
                $previousLabel = __('Année dernière', __FILE__);
                $currentLabel = __('Cette année', __FILE__);
                break;
            default:
                throw new Exception(__('Période invalide : ', __FILE__) . $period);
        }
        
        // Calculer les statistiques
        $previousStats = $cmd->getStatistique($previousStart, $previousEnd);
        $currentStats = $cmd->getStatistique($currentStart, $currentEnd);
        
        // Pour les valeurs cumulatives (Wh), utiliser max-min
        if ($isWh && isset($previousStats['max']) && isset($previousStats['min'])) {
            $previousValue = (floatval($previousStats['max']) - floatval($previousStats['min'])) / 1000; // Convert to kWh
        } else {
            $previousValue = isset($previousStats['avg']) ? floatval($previousStats['avg']) : 0;
        }
        
        if ($isWh && isset($currentStats['max']) && isset($currentStats['min'])) {
            $currentValue = (floatval($currentStats['max']) - floatval($currentStats['min'])) / 1000; // Convert to kWh
        } else {
            $currentValue = isset($currentStats['avg']) ? floatval($currentStats['avg']) : 0;
        }
        
        // Calculer le pourcentage
        $percent = $previousValue > 0 ? (($currentValue - $previousValue) / $previousValue * 100) : 0;
        $arrow = $percent >= 0 ? '↑' : '↓';
        $color = $percent >= 0 ? '#F44336' : '#4CAF50';
        
        ajax::success(array(
            'previousValue' => number_format($previousValue, 2, '.', ''),
            'currentValue' => number_format($currentValue, 2, '.', ''),
            'percent' => number_format(abs($percent), 1),
            'arrow' => $arrow,
            'color' => $color,
            'previousLabel' => $previousLabel,
            'currentLabel' => $currentLabel,
            'unit' => $isWh ? 'kWh' : $unit
        ));
    }

	throw new Exception(__('Aucune méthode correspondante', __FILE__));
	/*     * *********Catch exeption*************** */
} catch (Exception $e) {
	ajax::error(displayException($e), $e->getCode());
}
?>
